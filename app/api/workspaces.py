"""
Workspaces API — personal isolated spaces per user.

Each user can have up to 5 named workspaces. Switching workspace gives
a clean slate : the user only sees the avatars / images / videos / ads
created inside the active workspace. This is not team collaboration
(see `team.py` for that) — workspaces are strictly per-user buckets
meant to separate, say, "Ma marque beauté" from "Coaching client X"
from "Personal tests".

The workspace context is transported via the `X-Workspace-Id` request
header from the frontend. Content endpoints filter their list queries
by this header and stamp new rows with it.

Endpoints :
  GET    /workspaces                 — list my workspaces (primary first)
  POST   /workspaces                 — create a new workspace (≤ 5 max)
  PATCH  /workspaces/{id}            — rename / recolor
  DELETE /workspaces/{id}            — delete (cannot delete last one)

Notes on schema : the `workspaces` table + `workspace_id` foreign keys
on existing content tables are created by migration 015.
"""
from __future__ import annotations

import logging
import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.supabase import supabase
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# Tier policy — could be moved to pricing.py later if we gate it per plan.
MAX_WORKSPACES_PER_USER = 5

# Recognised accent colors (free-form hex is accepted too, but we clamp
# to a short whitelist from the frontend to keep the palette clean).
DEFAULT_ACCENT = "#3b82f6"
VALID_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    color: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    color: Optional[str] = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    color: str
    is_primary: bool
    created_at: str


def _sanitize_color(value: Optional[str]) -> str:
    if value and VALID_HEX_RE.match(value):
        return value
    return DEFAULT_ACCENT


# Content tables that carry a `workspace_id` column (migration 015).
# When we create a user's primary workspace, legacy rows (NULL) are
# backfilled to the primary so the user doesn't see their history
# disappear on first activation of the feature.
_WORKSPACE_SCOPED_TABLES = (
    "characters",
    "generated_images",
    "generated_ads",
    "video_jobs",
    "ai_video_jobs",
    "generated_clips",
)


def _backfill_legacy_to_workspace(user_id: str, workspace_id: str) -> None:
    """
    Once the primary workspace exists, assign all of this user's
    content that still has `workspace_id = NULL` to it. Safe to run
    multiple times — rows that already have a workspace are
    untouched by the `is_("workspace_id", "null")` filter.
    """
    for table in _WORKSPACE_SCOPED_TABLES:
        try:
            supabase.table(table).update({"workspace_id": workspace_id}).eq(
                "user_id", user_id
            ).is_("workspace_id", "null").execute()
        except Exception:
            # Some tables may not exist yet in dev databases or the
            # column may not have been backfilled by the migration.
            # Don't block app functionality on that.
            logger.exception("Backfill skipped for %s", table)


def _ensure_primary_exists(user_id: str) -> dict:
    """
    Guarantees that the user has a primary workspace. Called on every
    /workspaces GET/POST so new signups get seeded automatically.
    Side-effect : on first creation, backfills legacy NULL content
    rows to the primary so the switch to workspace-scoped queries
    isn't destructive.
    """
    existing = (
        supabase.table("workspaces")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    payload = {
        "user_id": user_id,
        "name": "Workspace",
        "color": DEFAULT_ACCENT,
        "is_primary": True,
    }
    created = supabase.table("workspaces").insert(payload).execute()
    primary = created.data[0]
    _backfill_legacy_to_workspace(user_id, primary["id"])
    return primary


def _require_workspace(user_id: str, workspace_id: str) -> dict:
    res = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return res.data[0]


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(user: Annotated[User, Depends(get_current_user)]):
    """
    Returns the user's workspaces, primary first. Lazily creates the
    primary workspace on first call so existing accounts start with
    something sensible.
    """
    _ensure_primary_exists(user.id)

    res = (
        supabase.table("workspaces")
        .select("id, name, color, is_primary, created_at")
        .eq("user_id", user.id)
        .order("is_primary", desc=True)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []


@router.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    body: WorkspaceCreate,
    user: Annotated[User, Depends(get_current_user)],
):
    """
    Create a new workspace. Enforces the 5-workspace cap. If the user
    has no workspace at all yet (fresh account), the first call will
    lazily create the primary first, then this call adds the second.
    """
    _ensure_primary_exists(user.id)

    count_res = (
        supabase.table("workspaces")
        .select("id", count="exact")
        .eq("user_id", user.id)
        .execute()
    )
    current_count = count_res.count or 0
    if current_count >= MAX_WORKSPACES_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"Tu as atteint la limite de {MAX_WORKSPACES_PER_USER} espaces de travail.",
        )

    payload = {
        "user_id": user.id,
        "name": body.name.strip(),
        "color": _sanitize_color(body.color),
        "is_primary": False,
    }
    created = supabase.table("workspaces").insert(payload).execute()
    return created.data[0]


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdate,
    user: Annotated[User, Depends(get_current_user)],
):
    _require_workspace(user.id, workspace_id)

    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.color is not None:
        updates["color"] = _sanitize_color(body.color)

    if not updates:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")

    res = (
        supabase.table("workspaces")
        .update(updates)
        .eq("id", workspace_id)
        .eq("user_id", user.id)
        .execute()
    )
    return res.data[0]


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(
    workspace_id: str,
    user: Annotated[User, Depends(get_current_user)],
):
    """
    Delete a workspace. The user must always have at least one
    workspace — deleting the last one is rejected. Content rows
    previously stamped with this workspace_id see their FK set to
    NULL (ON DELETE SET NULL) and get re-attached to the primary on
    next read.
    """
    target = _require_workspace(user.id, workspace_id)

    count_res = (
        supabase.table("workspaces")
        .select("id", count="exact")
        .eq("user_id", user.id)
        .execute()
    )
    if (count_res.count or 0) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Tu ne peux pas supprimer ton dernier espace.",
        )

    if target.get("is_primary"):
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ton espace principal.",
        )

    supabase.table("workspaces").delete().eq("id", workspace_id).eq(
        "user_id", user.id
    ).execute()
    return None


# ── Helper used by other API modules ────────────────────────────────
# Endpoints that list/create user content call `resolve_workspace_id`
# with the FastAPI `X-Workspace-Id` header to get the authoritative
# workspace to filter/stamp by. Returns None if no workspace header is
# set — caller can decide to fall back to "show everything" or "stamp
# with primary".

def resolve_workspace_id(
    user: Annotated[User, Depends(get_current_user)],
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
) -> str:
    """
    Always returns a valid workspace UUID for the caller.

    Strategy :
    1. If `X-Workspace-Id` header is set and matches one of the
       user's workspaces, use it.
    2. Otherwise, fall back to the user's primary workspace
       (lazily created on first call if the user has none yet).

    This ensures every content endpoint has clean isolation — no
    fallback to "show everything" when the header is missing, which
    would defeat the whole point of workspaces.
    """
    if x_workspace_id:
        try:
            res = (
                supabase.table("workspaces")
                .select("id")
                .eq("id", x_workspace_id)
                .eq("user_id", user.id)
                .limit(1)
                .execute()
            )
            if res.data:
                return x_workspace_id
        except Exception:
            logger.exception("resolve_workspace_id lookup failed")
    # Header missing or invalid → primary workspace (lazy-create).
    return _ensure_primary_exists(user.id)["id"]
