"""
Mini Apps API — user-created recipes on top of the 6 native Horpen
tools (canvas, avatar, adlab, thumbs, clipsy, trackify).

Concept
-------
A mini-app is a *saved configuration* on top of an existing Horpen
tool. The user describes in natural language what they want to
automate ("shorts TikTok sur les animaux exotiques"). A wizard LLM
(Claude) conducts a short interview (4-6 questions), compiles a
structured `spec` JSON, and saves it. The spec is then rendered in
a standard Horpen UI (same layout as /dashboard/images) so the
mini-app *feels* native to the app.

Hard rules enforced by the wizard system prompt :
  • The mini-app can only orchestrate one of the 6 existing Horpen
    tools. No external integrations, no custom backends.
  • The wizard returns either a follow-up question OR a final spec —
    never free-form advice.
  • If the user's intent is outside the Horpen perimeter (e.g.
    "auto-DM on Instagram"), the wizard says so and offers the
    closest Horpen-native alternative.

Endpoints :
  POST   /mini-apps/wizard/start      — opens a new wizard session
  POST   /mini-apps/wizard/message    — user reply → next LLM turn
  POST   /mini-apps                   — finalize the session as a mini-app
  GET    /mini-apps                   — list mini-apps in active workspace
  GET    /mini-apps/{slug}            — fetch one
  POST   /mini-apps/{slug}/run        — execute the workflow
  DELETE /mini-apps/{id}              — delete

Security : every endpoint is authed via `get_current_user` and scoped
by `workspace_id` read from `X-Workspace-Id` (same pattern as the
rest of the app).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.workspaces import resolve_workspace_id
from app.core.auth import get_current_user
from app.core.supabase import supabase
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_TOOLS = {"canvas", "avatar", "adlab", "thumbs", "clipsy", "trackify"}

# Wizard uses Claude via the anthropic SDK. Kept optional at import time
# so missing ANTHROPIC_API_KEY doesn't break app boot — the endpoint
# returns a clear error at call time.
try:
    from anthropic import Anthropic  # type: ignore
    _CLAUDE: Optional[Any] = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY")) if os.getenv(
        "ANTHROPIC_API_KEY"
    ) else None
except Exception:
    _CLAUDE = None


WIZARD_SYSTEM_PROMPT = """Tu es l'assistant "New App" de Horpen.ai, une suite IA française de création de contenu.

Ton job : interviewer l'utilisateur pour compiler une mini-app.

LES 6 OUTILS HORPEN (aucun autre n'est autorisé) :
  - canvas  : générateur d'images + vidéos IA (Gemini 3 Pro Image + Kling/Veo/Hailuo)
  - avatar  : entrainement + rendu d'avatars IA (visage + voix + script)
  - adlab   : génération d'ads variantes + A/B batch
  - thumbs  : génération de miniatures YouTube
  - clipsy  : long-form → shorts, prompt-to-video, pipeline auto
  - trackify : tracking des ads concurrents (scraper, hooks)

RÈGLES ABSOLUES :
1. Une mini-app orchestre UN SEUL outil Horpen à la fois. Si l'utilisateur demande plusieurs outils, tu sélectionnes le plus pertinent pour son besoin principal.
2. Tu ne proposes JAMAIS d'intégration externe (Instagram DM, Shopify, Make, Zapier, scraping custom, etc.). Si l'utilisateur le demande, tu expliques gentiment que Horpen est une suite de création de contenu, et tu proposes la plus proche alternative native.
3. Tu es CONCIS. Poses 4 à 6 questions maximum. Une question à la fois. Pas de blabla.
4. Les questions couvrent : niche/sujet, source des assets (upload / généré), style visuel, format de sortie, fréquence ou volume souhaité. Adapte selon le cas.

FORMAT DE RÉPONSE STRICT :
Tu réponds TOUJOURS avec un JSON valide de cette forme :

Pour poser une question :
{"type":"question","text":"Ta question concise","hint":"Un indice court ou exemple"}

Quand tu as assez d'infos, pour finaliser :
{"type":"spec","spec":{
  "name":"NomApp",
  "description":"1 phrase sur ce que fait la mini-app",
  "tool":"canvas|avatar|adlab|thumbs|clipsy|trackify",
  "accent":"#rrggbb",
  "logo_prompt":"Prompt Nano Banana pour logo — style carré 3D, couleur accent, glow néon",
  "system_prompt":"Le prompt final avec {placeholders} pour chaque variable",
  "fields":[
    {"key":"subject","label":"Sujet du jour","type":"text","default":"Lion"},
    {"key":"tone","label":"Ton","type":"select","options":["fun","éducatif","choc"],"default":"fun"}
  ]
}}

Si l'intent est hors scope Horpen :
{"type":"out_of_scope","reason":"explication courte","suggestion":"la plus proche alternative Horpen-native"}

N'EMBALLE JAMAIS la réponse dans du texte libre ou des backticks. JSON brut, strict, un seul objet."""


class WizardStart(BaseModel):
    initial_intent: str = Field(..., min_length=4, max_length=500)


class WizardMessage(BaseModel):
    session_id: str
    user_message: str = Field(..., min_length=1, max_length=2000)


class MiniAppCreate(BaseModel):
    session_id: str


class MiniAppRun(BaseModel):
    field_values: dict[str, Any]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:40] or f"app-{uuid.uuid4().hex[:6]}"


def _run_claude(messages: list[dict]) -> str:
    """
    Call Claude with the wizard system prompt. Returns the raw text
    response (expected to be a strict JSON object per the system
    prompt contract).
    """
    if _CLAUDE is None:
        raise HTTPException(
            status_code=503,
            detail="Le wizard IA n'est pas configuré (ANTHROPIC_API_KEY manquant).",
        )
    try:
        resp = _CLAUDE.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            system=WIZARD_SYSTEM_PROMPT,
            messages=messages,
        )
        # Anthropic SDK returns a list of content blocks ; join text blocks.
        chunks = []
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                chunks.append(block.text)
        return "".join(chunks).strip()
    except Exception:
        logger.exception("Claude call failed")
        raise HTTPException(status_code=502, detail="Erreur lors de l'appel au wizard IA.")


def _parse_wizard_reply(raw: str) -> dict:
    """
    The wizard is supposed to return strict JSON. In practice models
    occasionally wrap it in ```json fences — strip those defensively.
    """
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # remove first fence line and last fence
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Wizard returned non-JSON : %s", raw[:200])
        # Fallback : treat as a plain question so the UI stays usable.
        return {"type": "question", "text": raw}


# ─── Wizard endpoints ────────────────────────────────────────────────


@router.post("/mini-apps/wizard/start")
def wizard_start(
    body: WizardStart,
    user: Annotated[User, Depends(get_current_user)],
    workspace_id: Annotated[Optional[str], Depends(resolve_workspace_id)] = None,
):
    """
    Open a wizard session with the user's initial free-text intent.
    Returns the session_id + the first Claude turn (which is either a
    clarifying question or already a complete spec).
    """
    first_messages = [{"role": "user", "content": body.initial_intent.strip()}]
    raw = _run_claude(first_messages)
    parsed = _parse_wizard_reply(raw)

    session = {
        "user_id": user.id,
        "workspace_id": workspace_id,
        "messages": first_messages + [{"role": "assistant", "content": raw}],
        "draft_spec": parsed.get("spec") if parsed.get("type") == "spec" else None,
        "status": "ready" if parsed.get("type") == "spec" else "in_progress",
    }
    created = (
        supabase.table("mini_app_wizard_sessions").insert(session).execute()
    )
    row = created.data[0]
    return {"session_id": row["id"], "reply": parsed}


@router.post("/mini-apps/wizard/message")
def wizard_message(
    body: WizardMessage,
    user: Annotated[User, Depends(get_current_user)],
):
    """
    User sends a reply to the wizard. We re-run Claude with the full
    message history. When Claude returns a spec, we mark the session
    as ready so the frontend can offer the "Create" button.
    """
    sess_res = (
        supabase.table("mini_app_wizard_sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not sess_res.data:
        raise HTTPException(status_code=404, detail="Wizard session not found")

    session = sess_res.data[0]
    messages = session["messages"] + [{"role": "user", "content": body.user_message}]

    raw = _run_claude(messages)
    parsed = _parse_wizard_reply(raw)

    updated_messages = messages + [{"role": "assistant", "content": raw}]
    updated = {
        "messages": updated_messages,
        "draft_spec": parsed.get("spec") if parsed.get("type") == "spec" else session.get("draft_spec"),
        "status": "ready" if parsed.get("type") == "spec" else session["status"],
    }
    supabase.table("mini_app_wizard_sessions").update(updated).eq(
        "id", body.session_id
    ).execute()

    return {"reply": parsed, "status": updated["status"]}


# ─── Finalize the session as a persistent mini-app ──────────────────


@router.post("/mini-apps", status_code=201)
def create_mini_app(
    body: MiniAppCreate,
    user: Annotated[User, Depends(get_current_user)],
    workspace_id: Annotated[Optional[str], Depends(resolve_workspace_id)] = None,
):
    """
    Turn a wizard session into a real mini-app. Reads the ready spec
    from the session, validates it, and inserts into mini_apps.
    """
    sess_res = (
        supabase.table("mini_app_wizard_sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not sess_res.data:
        raise HTTPException(status_code=404, detail="Wizard session not found")
    sess = sess_res.data[0]
    spec = sess.get("draft_spec")
    if not spec:
        raise HTTPException(status_code=400, detail="Wizard session not finalized yet")

    tool = str(spec.get("tool", "")).lower()
    if tool not in ALLOWED_TOOLS:
        raise HTTPException(
            status_code=400,
            detail=f"Outil non supporté : {tool}. Attendu : {sorted(ALLOWED_TOOLS)}.",
        )

    name = str(spec.get("name") or "New App")[:64]
    slug = _slugify(name)

    # Ensure slug uniqueness per user — append a short uid if needed.
    existing = (
        supabase.table("mini_apps")
        .select("slug")
        .eq("user_id", user.id)
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if existing.data:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    payload = {
        "user_id": user.id,
        "workspace_id": workspace_id,
        "name": name,
        "slug": slug,
        "description": spec.get("description"),
        "logo_url": None,  # logo is generated async, see /generate-logo below
        "accent": spec.get("accent") or "#3b82f6",
        "tool": tool,
        "spec": spec,
    }
    created = supabase.table("mini_apps").insert(payload).execute()
    # Mark wizard session as consumed so it's not re-finalizable.
    supabase.table("mini_app_wizard_sessions").update(
        {"status": "finalized"}
    ).eq("id", body.session_id).execute()

    return created.data[0]


# ─── List / fetch / delete ──────────────────────────────────────────


@router.get("/mini-apps")
def list_mini_apps(
    user: Annotated[User, Depends(get_current_user)],
    workspace_id: Annotated[Optional[str], Depends(resolve_workspace_id)] = None,
):
    q = (
        supabase.table("mini_apps")
        .select("id, slug, name, description, logo_url, accent, tool, run_count, last_run_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
    )
    if workspace_id:
        q = q.eq("workspace_id", workspace_id)
    res = q.execute()
    return res.data or []


@router.get("/mini-apps/{slug}")
def get_mini_app(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
):
    res = (
        supabase.table("mini_apps")
        .select("*")
        .eq("user_id", user.id)
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Mini-app not found")
    return res.data[0]


@router.delete("/mini-apps/{app_id}", status_code=204)
def delete_mini_app(
    app_id: str,
    user: Annotated[User, Depends(get_current_user)],
):
    supabase.table("mini_apps").delete().eq("id", app_id).eq(
        "user_id", user.id
    ).execute()
    return None


# ─── Run ────────────────────────────────────────────────────────────
# Minimal MVP : substitute the field values into the spec's
# system_prompt and return the resulting "composed prompt" to the
# frontend, which then calls the appropriate tool endpoint.
# Full server-side orchestration (auto-calling Canvas/Clipsy etc. on
# behalf of the user) is next iteration — for now the frontend wires
# the mini-app's form to its tool's existing UI.


@router.post("/mini-apps/{slug}/run")
def run_mini_app(
    slug: str,
    body: MiniAppRun,
    user: Annotated[User, Depends(get_current_user)],
):
    app = get_mini_app(slug, user)
    spec = app.get("spec") or {}
    template = str(spec.get("system_prompt", ""))
    composed = template
    for key, value in (body.field_values or {}).items():
        composed = composed.replace(f"{{{key}}}", str(value))

    supabase.table("mini_apps").update(
        {"run_count": (app.get("run_count") or 0) + 1, "last_run_at": "now()"}
    ).eq("id", app["id"]).execute()

    return {
        "tool": app["tool"],
        "composed_prompt": composed,
        "accent": app.get("accent"),
        "name": app.get("name"),
    }
