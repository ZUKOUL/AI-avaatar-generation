"""
Enhancor multi-model API gateway.

Horpen integrates Enhancor's unified `x-api-key` API to power 6 generative
models behind a single Creator UI :

  - Seedance 2.0      → `enhancor-ugc-full-access` (video, 4-15s)
  - Kora Pro          → `kora` (image)
  - Nano Banana 2     → `nano-banana-2-new` (image, supports /status)
  - Image Editor      → `enhancor-image-editor-full-access`
  - Realistic Skin    → `realistic-skin` (portrait enhance)
  - Upscaler          → `detailed` (upscale + enhance)

Each model has a unique endpoint :
    https://apireq.enhancor.ai/api/{slug}/v1/queue
And a polling mechanism :
    - `hasStatus=true` (Nano Banana) → POST `.../v1/status` with request_id
    - others (Seedance) → webhook.site bucket created on the fly + polled

Routes (JWT-protected):
    POST   /enhancor/upload-asset   upload a file → tmpfiles.org public URL
    POST   /enhancor/generate       submit job → returns request_id + token
    GET    /enhancor/status         poll job status by request_id

The API key lives in `ENHANCOR_API_KEY` env var. Calls fail fast with
402 when missing rather than silently failing on Enhancor's side.
"""
from __future__ import annotations

import json
import logging
import mimetypes
from typing import Annotated, Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


ENHANCOR_BASE = "https://apireq.enhancor.ai/api"
WEBHOOK_SITE_TOKEN_URL = "https://webhook.site/token"


def _require_key() -> str:
    """Return the configured Enhancor API key or 402 hard-fail."""
    if not settings.ENHANCOR_API_KEY:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "ENHANCOR_KEY_MISSING",
                "message": "ENHANCOR_API_KEY not configured on the server. "
                "Add it to the .env file and restart.",
            },
        )
    return settings.ENHANCOR_API_KEY


# ─── 1. Asset upload ─────────────────────────────────────────────────
# Enhancor expects PUBLIC URLs for input media (images, videos, audio)
# — not raw bytes. We use tmpfiles.org as a free public mirror : upload
# the user's file there, get back a short-lived URL, hand it off to
# Enhancor in the generate call.

@router.post("/upload-asset")
async def upload_asset(
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    """Upload a user file to tmpfiles.org and return its public URL."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Empty filename")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    content_type = (
        file.content_type
        or mimetypes.guess_type(file.filename)[0]
        or "application/octet-stream"
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                "https://tmpfiles.org/api/v1/upload",
                files={"file": (file.filename, data, content_type)},
            )
            resp.raise_for_status()
            payload = resp.json()
        except httpx.HTTPError as e:
            logger.warning(f"tmpfiles.org upload failed: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"tmpfiles.org upload failed: {e}",
            )

    if payload.get("status") != "success" or not payload.get("data", {}).get("url"):
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected tmpfiles.org response: {payload}",
        )

    # tmpfiles.org returns a viewer URL like https://tmpfiles.org/12345/file.jpg
    # — convert it to the direct-download form Enhancor can fetch :
    #   https://tmpfiles.org/dl/12345/file.jpg
    raw_url: str = payload["data"]["url"]
    direct_url = raw_url.replace("tmpfiles.org/", "tmpfiles.org/dl/")

    logger.info(
        f"enhancor: user {current_user['id']} uploaded "
        f"{file.filename} → {direct_url}"
    )
    return {"url": direct_url}


# ─── 2. Job submission ───────────────────────────────────────────────
# Frontend pre-computes the model slug + webhook field name + extra
# body params per model (see /lib/enhancorModels.ts). We just forward
# the assembled body to Enhancor with the x-api-key, after wiring a
# webhook.site bucket for async result delivery.

class EnhancorGenerateBody(BaseModel):
    """Loose body — most fields are model-specific. We forward
    everything Enhancor expects without hard-typing each model's
    schema (which would duplicate the frontend MODELS registry)."""

    # Routing
    model_slug: str
    mode: Optional[str] = None
    webhook_field: str = "webhook_url"
    has_status: bool = False

    # Common
    prompt: str = ""
    duration: Optional[Any] = None
    resolution: Optional[str] = None
    aspect_ratio: Optional[str] = None

    # Kora-specific
    model: Optional[str] = None
    generation_mode: Optional[str] = None
    image_size: Optional[str] = None
    img_url: Optional[str] = None

    # Nano Banana
    nb_resolution: Optional[str] = None
    nb_aspect_ratio: Optional[str] = None
    input_images: Optional[list[str]] = None

    # Seedance flags
    fast_mode: Optional[bool] = None
    full_access: Optional[bool] = None

    # Media arrays
    images: Optional[list[str]] = None
    videos: Optional[list[str]] = None
    audios: Optional[list[str]] = None
    products: Optional[list[str]] = None
    influencers: Optional[list[str]] = None

    # Seedance modes
    lipsyncing_audio: Optional[str] = None
    first_frame_image: Optional[str] = None
    last_frame_image: Optional[str] = None
    multi_frame_prompts: Optional[list[dict]] = None


@router.post("/generate")
async def generate(
    body: EnhancorGenerateBody,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Submit a generation job to Enhancor and return the request_id."""
    api_key = _require_key()

    # 1. Provision a webhook.site bucket for result delivery. Models
    #    that expose `/status` (Nano Banana) don't strictly need it,
    #    but Enhancor's `queue` endpoint refuses requests without a
    #    webhook url field, so we always include one.
    webhook_token: str = ""
    webhook_url: str = "https://webhook.site/fallback"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            tk = await client.post(
                WEBHOOK_SITE_TOKEN_URL,
                json={},
                headers={"Accept": "application/json"},
            )
            tk.raise_for_status()
            webhook_token = tk.json().get("uuid", "")
            if webhook_token:
                webhook_url = f"https://webhook.site/{webhook_token}"
        except httpx.HTTPError as e:
            if not body.has_status:
                # No webhook means we'd never get the result back.
                logger.error(f"enhancor: webhook.site provisioning failed: {e}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Could not provision webhook.site bucket: {e}",
                )
            # For /status-enabled models, soft-fail and continue.
            logger.warning(
                f"enhancor: webhook provisioning failed but model has "
                f"/status fallback — continuing: {e}"
            )

    # 2. Assemble Enhancor's body. Strategy: forward every non-null
    #    field from EnhancorGenerateBody using the same key Enhancor
    #    expects. Duration is stringified per Enhancor's convention.
    api_body: dict[str, Any] = {"prompt": body.prompt}
    api_body[body.webhook_field] = webhook_url

    for key in (
        "resolution",
        "aspect_ratio",
        "model",
        "generation_mode",
        "image_size",
        "img_url",
    ):
        val = getattr(body, key, None)
        if val is not None:
            api_body[key] = val

    if body.duration is not None:
        api_body["duration"] = str(body.duration)

    # Nano Banana overrides resolution/aspect_ratio with its own
    # version names + uses input_images instead of images[].
    if body.nb_resolution:
        api_body["resolution"] = body.nb_resolution
    if body.nb_aspect_ratio:
        api_body["aspect_ratio"] = body.nb_aspect_ratio
    if body.input_images:
        api_body["input_images"] = body.input_images

    if body.fast_mode is not None:
        api_body["fast_mode"] = bool(body.fast_mode)
    if body.full_access is not None:
        api_body["full_access"] = bool(body.full_access)

    # Seedance-specific routing : `type` + `mode` keys.
    if body.model_slug == "enhancor-ugc-full-access":
        if body.mode == "text_to_video":
            api_body["type"] = "text-to-video"
        elif body.mode:
            api_body["type"] = "image-to-video"
            api_body["mode"] = body.mode

    # Media arrays — only emit non-empty.
    for key in ("images", "videos", "audios", "products", "influencers"):
        arr = getattr(body, key, None)
        if arr:
            api_body[key] = arr

    # Mode-specific Seedance fields.
    if body.lipsyncing_audio:
        api_body["lipsyncing_audio"] = body.lipsyncing_audio
    if body.first_frame_image:
        api_body["first_frame_image"] = body.first_frame_image
    if body.last_frame_image:
        api_body["last_frame_image"] = body.last_frame_image
    if body.multi_frame_prompts:
        api_body["multi_frame_prompts"] = body.multi_frame_prompts

    # 3. POST to Enhancor.
    enhancor_url = f"{ENHANCOR_BASE}/{body.model_slug}/v1/queue"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                enhancor_url,
                json=api_body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                },
            )
        except httpx.HTTPError as e:
            logger.error(f"enhancor: network error to {enhancor_url}: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Network error contacting Enhancor: {e}",
            )

    if resp.status_code >= 400:
        # Forward Enhancor's error so the user sees the real cause
        # (e.g. invalid mode, missing field, billing block).
        body_text = resp.text
        logger.warning(
            f"enhancor: {resp.status_code} from {enhancor_url}: {body_text}"
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Enhancor API error {resp.status_code}: {body_text}",
        )

    try:
        result = resp.json()
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"Enhancor returned non-JSON response: {resp.text[:200]}",
        )

    request_id = result.get("requestId") or result.get("request_id", "unknown")
    logger.info(
        f"enhancor: user {current_user['id']} queued {body.model_slug} "
        f"job {request_id} (webhook_token={webhook_token or 'none'})"
    )
    return {
        "ok": True,
        "request_id": request_id,
        "webhook_token": webhook_token,
        "message": "Génération lancée",
    }


# ─── 3. Status polling ───────────────────────────────────────────────
# Two methods :
#   - direct  : POST /v1/status (Nano Banana etc.)
#   - webhook : GET webhook.site bucket and find the matching request_id

@router.get("/status")
async def status(
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: str,
    method: str = "webhook",
    model_slug: Optional[str] = None,
    webhook_token: Optional[str] = None,
):
    """Poll Enhancor for a generation status update."""
    api_key = _require_key()

    # Method 1 : direct /status (Nano Banana, future hasStatus models)
    if method == "direct" and model_slug and request_id:
        status_url = f"{ENHANCOR_BASE}/{model_slug}/v1/status"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post(
                    status_url,
                    json={"request_id": request_id},
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": api_key,
                        "Accept": "application/json",
                    },
                )
            except httpx.HTTPError as e:
                return {"status": "PENDING", "poll_error": str(e)}

        if resp.status_code >= 400:
            return {
                "status": "PENDING",
                "poll_error": f"{resp.status_code}: {resp.text[:200]}",
            }

        try:
            data = resp.json()
        except json.JSONDecodeError:
            return {"status": "PENDING", "poll_error": "non-JSON response"}

        return {
            "status": data.get("status", "PENDING"),
            "result": data.get("result"),
            "error": data.get("error"),
            "request_id": data.get("requestId", request_id),
            "cost": data.get("cost"),
        }

    # Method 2 : webhook.site polling (Seedance + older models)
    if not webhook_token:
        return {"status": "UNKNOWN", "error": "No webhook_token provided"}

    poll_url = (
        f"https://webhook.site/token/{webhook_token}/requests"
        f"?sorting=newest&per_page=5"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                poll_url,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            return {"status": "PENDING", "poll_error": str(e)}

    for entry in data.get("data", []):
        content_str = entry.get("content", "{}")
        try:
            content = json.loads(content_str)
        except json.JSONDecodeError:
            continue
        entry_rid = content.get("request_id", "")
        if entry_rid == request_id or not request_id:
            return {
                "status": content.get("status", "UNKNOWN"),
                "result": content.get("result"),
                "error": content.get("error"),
                "request_id": entry_rid,
            }

    return {"status": "PENDING"}
