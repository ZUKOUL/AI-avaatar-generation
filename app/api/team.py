"""
Team API — workspace sharing + task assignment.

A "team" is a workspace a user creates, invites people into, and
assigns product-scoped tasks within (génération, tracking, analytics).

Endpoints :
  POST   /team/teams                          — create a team
  GET    /team/teams                          — teams I'm a member of
  GET    /team/teams/{team_id}                — team detail
  DELETE /team/teams/{team_id}                — delete a team (owner only)

  POST   /team/teams/{team_id}/invite         — invite by email
  POST   /team/invites/accept                 — accept invite by token
  GET    /team/teams/{team_id}/members        — list members
  DELETE /team/teams/{team_id}/members/{uid}  — remove a member

  POST   /team/teams/{team_id}/tasks          — create a task
  GET    /team/teams/{team_id}/tasks          — list tasks
  PATCH  /team/tasks/{task_id}                — update a task

Roles :
  - "admin"    : full access, billing, invites, task admin
  - "creative" : use the tools, own their tasks
  - "analyst"  : read-only creatives, full Spyder + analytics access

Security : every route that touches a team_id double-checks that the
caller is a member. The invite flow uses a random token stored
server-side (no predictable structure).
"""
from __future__ import annotations

import logging
import re
import secrets
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.core.auth import get_current_user
from app.core.supabase import supabase
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_ROLES = {"admin", "creative", "analyst"}
ALLOWED_TASK_STATUSES = {"todo", "in_progress", "done", "cancelled"}
ALLOWED_PRODUCT_SLUGS = {"spyder", "canvas", "avatar", "adlab", "thumbs", "autoclip"}


# ─────────────────────────────────────────────────────────────────
#  Schemas
# ─────────────────────────────────────────────────────────────────


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class TeamResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: str
    avatar_url: Optional[str] = None
    created_at: str


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "creative"


class InviteResponse(BaseModel):
    id: str
    team_id: str
    email: str
    role: str
    token: str
    status: str
    expires_at: str


class AcceptInviteRequest(BaseModel):
    token: str


class MemberResponse(BaseModel):
    user_id: str
    team_id: str
    role: str
    joined_at: str
    # Enriched from the users table :
    email: Optional[str] = None


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    category: str = "generation"
    product_slug: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None  # ISO8601 timestamp


class UpdateTaskRequest(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    team_id: str
    title: str
    description: Optional[str] = None
    category: str
    product_slug: Optional[str] = None
    assignee_id: Optional[str] = None
    created_by: Optional[str] = None
    status: str
    due_at: Optional[str] = None
    created_at: str


# ─────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────


def _slugify(name: str) -> str:
    """Turn a team name into a URL-safe slug. Not meant to be globally
    unique — the DB enforces uniqueness and we append a short token if
    the slug collides."""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40] or "team"


def _ensure_member(team_id: str, user_id: str) -> dict:
    """Fetch the membership row for this (team, user) or raise 403.
    Returns the row so the caller can check role / admin-ness."""
    res = (
        supabase.table("team_members")
        .select("role, team_id, user_id")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(403, "not a member of this team")
    return row


def _require_admin(team_id: str, user_id: str) -> None:
    member = _ensure_member(team_id, user_id)
    if member["role"] != "admin":
        raise HTTPException(403, "admin role required")


# ─────────────────────────────────────────────────────────────────
#  Teams CRUD
# ─────────────────────────────────────────────────────────────────


@router.post("/teams", response_model=TeamResponse, status_code=201)
def create_team(
    payload: CreateTeamRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    """Create a team owned by the caller. The owner is immediately
    inserted as an admin member so subsequent access checks work
    uniformly via team_members."""
    slug = _slugify(payload.name)
    # Collision guard : append a 6-char token if slug already taken.
    existing = supabase.table("teams").select("id").eq("slug", slug).limit(1).execute()
    if existing.data:
        slug = f"{slug}-{secrets.token_hex(3)}"

    res = (
        supabase.table("teams")
        .insert({"name": payload.name, "slug": slug, "owner_id": str(user.id)})
        .execute()
    )
    team = (res.data or [None])[0]
    if not team:
        raise HTTPException(500, "team creation returned no rows")

    # Owner = admin member by default.
    supabase.table("team_members").insert(
        {"team_id": team["id"], "user_id": str(user.id), "role": "admin"}
    ).execute()

    return TeamResponse(**team)


@router.get("/teams", response_model=list[TeamResponse])
def list_my_teams(user: Annotated[User, Depends(get_current_user)]):
    """All teams the user is a member of (owner OR invited)."""
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", str(user.id))
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]
    if not team_ids:
        return []
    res = (
        supabase.table("teams")
        .select("id, name, slug, owner_id, avatar_url, created_at")
        .in_("id", team_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return [TeamResponse(**t) for t in (res.data or [])]


@router.get("/teams/{team_id}", response_model=TeamResponse)
def get_team(team_id: str, user: Annotated[User, Depends(get_current_user)]):
    _ensure_member(team_id, str(user.id))
    res = (
        supabase.table("teams")
        .select("id, name, slug, owner_id, avatar_url, created_at")
        .eq("id", team_id)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "team not found")
    return TeamResponse(**row)


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(team_id: str, user: Annotated[User, Depends(get_current_user)]):
    """Owner-only delete. Cascades to members, invites and tasks via
    the FK constraints."""
    res = (
        supabase.table("teams")
        .select("owner_id")
        .eq("id", team_id)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "team not found")
    if row["owner_id"] != str(user.id):
        raise HTTPException(403, "only the owner can delete a team")
    supabase.table("teams").delete().eq("id", team_id).execute()


# ─────────────────────────────────────────────────────────────────
#  Invites
# ─────────────────────────────────────────────────────────────────


@router.post("/teams/{team_id}/invite", response_model=InviteResponse, status_code=201)
def invite_member(
    team_id: str,
    payload: InviteRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    _require_admin(team_id, str(user.id))
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(400, f"role must be one of {sorted(ALLOWED_ROLES)}")

    token = secrets.token_urlsafe(24)
    try:
        res = (
            supabase.table("team_invites")
            .insert(
                {
                    "team_id": team_id,
                    "email": str(payload.email).lower(),
                    "role": payload.role,
                    "token": token,
                    "invited_by": str(user.id),
                }
            )
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            raise HTTPException(500, "invite insert returned no rows")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("invite_member failed")
        raise HTTPException(500, f"invite failed: {e}")
    return InviteResponse(**row)


@router.post("/invites/accept", response_model=TeamResponse)
def accept_invite(
    payload: AcceptInviteRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    res = (
        supabase.table("team_invites")
        .select("id, team_id, email, role, status, expires_at")
        .eq("token", payload.token)
        .limit(1)
        .execute()
    )
    invite = (res.data or [None])[0]
    if not invite:
        raise HTTPException(404, "invite not found")
    if invite["status"] != "pending":
        raise HTTPException(409, f"invite already {invite['status']}")
    # (expiry is enforced lazily here : the scheduled cron will flip
    # expired invites to status='expired'.)

    # Guard : require the email on the invite to match the caller, so
    # you can't accept somebody else's invite by stealing the token.
    if (user.email or "").lower() != invite["email"].lower():
        raise HTTPException(403, "invite email does not match")

    # Insert the membership + flip the invite.
    supabase.table("team_members").upsert(
        {"team_id": invite["team_id"], "user_id": str(user.id), "role": invite["role"]},
        on_conflict="team_id,user_id",
    ).execute()
    supabase.table("team_invites").update(
        {"status": "accepted", "accepted_at": "now()"}
    ).eq("id", invite["id"]).execute()

    team_res = (
        supabase.table("teams")
        .select("id, name, slug, owner_id, avatar_url, created_at")
        .eq("id", invite["team_id"])
        .limit(1)
        .execute()
    )
    return TeamResponse(**team_res.data[0])


@router.get("/teams/{team_id}/members", response_model=list[MemberResponse])
def list_members(team_id: str, user: Annotated[User, Depends(get_current_user)]):
    _ensure_member(team_id, str(user.id))
    rows = (
        supabase.table("team_members")
        .select("user_id, team_id, role, joined_at")
        .eq("team_id", team_id)
        .order("joined_at", desc=False)
        .execute()
    )
    members = rows.data or []

    # Enrich with user emails so the UI can show something human.
    user_ids = [m["user_id"] for m in members]
    emails: dict[str, str] = {}
    if user_ids:
        u = supabase.table("users").select("id, email").in_("id", user_ids).execute()
        emails = {row["id"]: row.get("email") for row in (u.data or [])}

    return [
        MemberResponse(**m, email=emails.get(m["user_id"]))
        for m in members
    ]


@router.delete("/teams/{team_id}/members/{user_id}", status_code=204)
def remove_member(
    team_id: str,
    user_id: str,
    user: Annotated[User, Depends(get_current_user)],
):
    _require_admin(team_id, str(user.id))
    # Can't remove the owner.
    team_res = supabase.table("teams").select("owner_id").eq("id", team_id).limit(1).execute()
    team = (team_res.data or [None])[0]
    if team and team["owner_id"] == user_id:
        raise HTTPException(400, "cannot remove the team owner")
    supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", user_id).execute()


# ─────────────────────────────────────────────────────────────────
#  Tasks
# ─────────────────────────────────────────────────────────────────


@router.post("/teams/{team_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    team_id: str,
    payload: CreateTaskRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    _ensure_member(team_id, str(user.id))
    if payload.product_slug and payload.product_slug not in ALLOWED_PRODUCT_SLUGS:
        raise HTTPException(400, f"product_slug must be in {sorted(ALLOWED_PRODUCT_SLUGS)}")
    if payload.assignee_id:
        # Assignee must already be a member.
        _ensure_member(team_id, payload.assignee_id)

    row = {
        "team_id": team_id,
        "title": payload.title,
        "description": payload.description,
        "category": payload.category,
        "product_slug": payload.product_slug,
        "assignee_id": payload.assignee_id,
        "created_by": str(user.id),
        "due_at": payload.due_at,
    }
    res = supabase.table("team_tasks").insert(row).execute()
    inserted = (res.data or [None])[0]
    if not inserted:
        raise HTTPException(500, "task insert returned no rows")
    return TaskResponse(**inserted)


@router.get("/teams/{team_id}/tasks", response_model=list[TaskResponse])
def list_tasks(team_id: str, user: Annotated[User, Depends(get_current_user)]):
    _ensure_member(team_id, str(user.id))
    res = (
        supabase.table("team_tasks")
        .select("*")
        .eq("team_id", team_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [TaskResponse(**t) for t in (res.data or [])]


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: str,
    payload: UpdateTaskRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    existing = (
        supabase.table("team_tasks")
        .select("*")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    task = (existing.data or [None])[0]
    if not task:
        raise HTTPException(404, "task not found")
    # Must belong to a team the caller is in.
    _ensure_member(task["team_id"], str(user.id))

    update: dict = {}
    if payload.status is not None:
        if payload.status not in ALLOWED_TASK_STATUSES:
            raise HTTPException(400, f"status must be in {sorted(ALLOWED_TASK_STATUSES)}")
        update["status"] = payload.status
    if payload.title is not None:
        update["title"] = payload.title
    if payload.description is not None:
        update["description"] = payload.description
    if payload.assignee_id is not None:
        _ensure_member(task["team_id"], payload.assignee_id)
        update["assignee_id"] = payload.assignee_id
    if payload.due_at is not None:
        update["due_at"] = payload.due_at

    if not update:
        return TaskResponse(**task)

    update["updated_at"] = "now()"
    res = supabase.table("team_tasks").update(update).eq("id", task_id).execute()
    updated = (res.data or [None])[0] or {**task, **update}
    return TaskResponse(**updated)
