````markdown
# Implementation Plan: Persistent DB (001-persistent-db)

**Branch**: `001-persistent-db` | **Date**: 2025-11-12 | **Spec**: `spec.md`
**Input**: Feature specification from `/specs/001-persistent-db/spec.md`

## Summary

Make the application's DB initialization behavior non-destructive: on startup the app must check for an existing local SQLite DB file and only create/initialize a new DB when none exists. When a DB exists the app must verify schema and apply safe, idempotent migrations (for the MVP, add a missing `hidden` column). All actions must be logged and failures must be visible.

## Technical Context

**Language/Version**: Python 3.x (current project uses Flask + pandas)
**Primary Dependencies**: Flask, pandas, sqlite3 (stdlib)
**Storage**: Local SQLite file `budget_sniffer.db` with schema defined in `schema.sql`
**Testing**: pytest (or a small unittest harness)
**Target Platform**: macOS / Windows (local desktop running `python app.py`)
**Project Type**: Single Python project (repo root contains `app.py`)
**Performance Goals**: N/A for this change (non-functional: init should be quick)
**Constraints**: No data loss; migrations must be idempotent and logged.

## Constitution Check

The feature aligns with the project constitution (privacy-first, local-first, data integrity & deduplication, observability). In particular:

- Data remains local-only and is not overwritten by default.
- Logging and auditability are preserved (writes to `logs/app.log`).

No constitution violations detected.

## Project Structure

Selected layout: single Python project (use existing layout)

Files touched by this feature:

- `app.py` — update `init_db()` logic and logging
- `schema.sql` — existing schema; used for initialization
- `specs/001-persistent-db/spec.md` — spec (this file)
- `specs/001-persistent-db/plan.md` — this file
- `specs/001-persistent-db/tasks.md` — generated tasks (next)
- `tests/` — add unit/integration tests for DB init behavior

## Migration & Rollout

1. Implement code changes in `app.py` and add tests in `tests/test_db_init.py`.
2. Run unit tests and manual checks (no-file, empty-file, existing DB with/without `hidden` column).
3. Merge to `main` and release as part of minor maintenance version.

## Acceptance gating

- All unit/integration tests pass.
- Manual validation steps in the spec are verified by developer.

````