"""
Auto-migration runner — executes pending SQL migration files against the
Supabase Postgres database at app boot so we never have to touch the
Supabase Dashboard by hand when shipping a schema change.

## Contract with future-me / any other dev

1.  **Additive only.** Every migration in `supabase/migrations/` MUST be
    idempotent and non-destructive: `CREATE TABLE IF NOT EXISTS`,
    `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
    No `DROP`, no `RENAME`, no data-destroying operations. If we ever
    need to remove something, it goes through the Supabase SQL Editor
    deliberately and once.
2.  **Tracked.** We keep a `schema_migrations` table so each file runs at
    most once per database. Re-running the app a hundred times doesn't
    re-execute anything.
3.  **Lock-safe.** A Postgres advisory lock wraps the whole run so if two
    EC2 instances boot at the same time, only one runs the migrations
    and the other just waits then no-ops.
4.  **Fail-soft on missing config.** If `SUPABASE_DB_URL` isn't set, we
    log a warning and skip. The app still boots. This lets us deploy
    the migration-runner code itself without breaking prod the instant
    it lands.
5.  **Fail-loud on migration error.** Once the runner is active, a SQL
    error in a migration aborts startup — better to crash early than to
    serve traffic against a half-migrated schema.

## How to add a new migration

1.  Drop a file in `supabase/migrations/` named `NNN_description.sql`.
    The `NNN_` prefix controls run order (alphabetical).
2.  Make it idempotent.
3.  Commit + push. Next EC2 boot runs it automatically.
"""

from __future__ import annotations

import glob
import hashlib
import logging
import os
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("migrations")

# Arbitrary 64-bit key used with pg_advisory_lock so concurrent instances
# serialise on the same lock. Any constant works; this one is derived from
# a stable string so it's easy to recognise in Postgres' pg_locks view.
_ADVISORY_LOCK_KEY = 0x484F5250454E  # 'HORPEN' in hex

# Path to the migrations directory. Resolved relative to this file so it
# works the same locally, on EC2, in Docker, etc.
_MIGRATIONS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "migrations")
)


def _get_connection():
    """Open a fresh psycopg2 connection to the Supabase Postgres.
    Returns None if the driver or connection string isn't available —
    callers treat that as "skip migrations, keep booting"."""
    if not settings.SUPABASE_DB_URL:
        logger.info(
            "SUPABASE_DB_URL not set — skipping auto-migrations. "
            "Set it to enable automatic schema updates on boot."
        )
        return None
    try:
        import psycopg2  # imported lazily so the app still boots if the
                         # driver isn't installed yet on some environment
    except ImportError:
        logger.warning(
            "psycopg2 not installed — skipping auto-migrations. "
            "Run `pip install psycopg2-binary` to enable them."
        )
        return None
    try:
        conn = psycopg2.connect(settings.SUPABASE_DB_URL)
        conn.autocommit = False  # we manage transactions per migration
        return conn
    except Exception as e:
        logger.error(f"Failed to connect for migrations: {e}")
        return None


def _ensure_tracking_table(cur) -> None:
    """Create the `schema_migrations` ledger if it doesn't exist.
    Stores filename + sha256 of the SQL content + when it ran. The hash
    lets us detect if someone edited a migration file after it shipped
    (which is a mistake — migrations are append-only)."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            filename   text PRIMARY KEY,
            sha256     text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now()
        );
        """
    )


def _list_migration_files() -> list[str]:
    """All `.sql` files in the migrations dir, sorted alphabetically.
    Returns absolute paths."""
    if not os.path.isdir(_MIGRATIONS_DIR):
        logger.warning(f"Migrations dir not found: {_MIGRATIONS_DIR}")
        return []
    return sorted(glob.glob(os.path.join(_MIGRATIONS_DIR, "*.sql")))


def _already_applied(cur, filename: str) -> Optional[str]:
    """Return the stored sha256 if this migration has run before, else None."""
    cur.execute(
        "SELECT sha256 FROM public.schema_migrations WHERE filename = %s",
        (filename,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _apply_migration(conn, path: str) -> None:
    """Read the file, execute it, record the ledger entry. Runs in a
    single transaction so a SQL error rolls the whole file back."""
    filename = os.path.basename(path)
    with open(path, "r", encoding="utf-8") as f:
        sql = f.read()
    sha = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    with conn.cursor() as cur:
        previous_sha = _already_applied(cur, filename)
        if previous_sha is not None:
            if previous_sha != sha:
                # Someone edited the file after it shipped. Don't try to
                # re-run it (could be destructive) — just log loudly so
                # we notice. The correct fix is a NEW migration file.
                logger.warning(
                    f"Migration {filename} content changed since it was "
                    f"applied (old sha={previous_sha[:12]}, new sha={sha[:12]}). "
                    f"Ignoring — add a new migration instead of editing old ones."
                )
            return

        logger.info(f"Applying migration: {filename}")
        try:
            cur.execute(sql)
            cur.execute(
                "INSERT INTO public.schema_migrations (filename, sha256) "
                "VALUES (%s, %s)",
                (filename, sha),
            )
            conn.commit()
            logger.info(f"Applied migration: {filename}")
        except Exception:
            conn.rollback()
            raise


def run_pending_migrations() -> None:
    """Entry point — called once at app startup.

    Safe to call even when no DB config exists (no-ops). Safe to call
    from multiple instances at once (advisory lock serialises them)."""
    conn = _get_connection()
    if conn is None:
        return

    try:
        with conn.cursor() as cur:
            # Serialise across instances. This BLOCKS until any other
            # instance currently migrating finishes — which is fine: boot
            # already involves waiting for the app to warm up.
            cur.execute("SELECT pg_advisory_lock(%s)", (_ADVISORY_LOCK_KEY,))
            conn.commit()

        try:
            with conn.cursor() as cur:
                _ensure_tracking_table(cur)
                conn.commit()

            files = _list_migration_files()
            if not files:
                logger.info("No migration files found — nothing to do.")
                return

            for path in files:
                _apply_migration(conn, path)

            logger.info(f"Migration run complete. Checked {len(files)} file(s).")
        finally:
            # Release lock regardless of success/failure
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(%s)", (_ADVISORY_LOCK_KEY,))
                conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass
