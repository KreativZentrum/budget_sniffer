````markdown
---

description: "Task list for 001-persistent-db: make DB init persistent and idempotent"

---

# Tasks: 001-persistent-db — Persistent DB

**Input**: `spec.md`, `plan.md`
**Prerequisites**: Foundation codebase (app.py, schema.sql)

## Phase 1: Setup (Shared Infrastructure)

- [P] T001 Add/verify logging path: ensure `logs/` exists and `app.log` is writable (`app.py`/logging config)
- [P] T002 Add development README note describing DB behavior and developer opt-in recreate flag (`README.md` or docs/)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the DB initialization behavior and migrations framework

- T003 [P] Implement `init_db()` logic to detect existing DB file and apply schema only when required (`app.py`)
- T004 [P] Add idempotent migration step: check `PRAGMA table_info(transactions)` and `ALTER TABLE` to add `hidden` column if missing (`app.py`)
- T005 Tidy: ensure `schema.sql` is authoritative and idempotent (`schema.sql`)
- T006 Create developer opt-in flag for force recreate (env var `RECREATE_DB=true` or CLI) and document it (non-default) (`app.py`, docs)

**Checkpoint**: The app can start without destroying an existing DB and will add missing columns safely

---

## Phase 3: User Story 1 - DB Initialization (Priority: P1) 🎯 MVP

**Goal**: Non-destructive DB init and lightweight migration

### Implementation tasks
- T007 [US1] Write unit tests for `init_db()` behavior (no-file, empty-file, existing DB missing column) (`tests/test_db_init.py`)
- T008 [US1] Add integration test simulating import and verifying existing data preserved (`tests/integration/test_import_preserves_data.py`)
- T009 [US1] Update logging statements to include actions (created DB, verified schema, migrated columns) (`app.py`)

### Tests
- T010 [US1] Manual verification steps added to `spec.md` and `README.md`

---

## Phase 4: Polish & Documentation

- T011 Documentation: Add short note in About or Quickstart explaining DB location and backup instructions
- T012 Changelog: prepare release notes for the non-destructive DB init behavior

---

## Dependencies & Execution Order

- Foundational tasks (T003–T006) block user story work. Tests and docs can proceed in parallel where safe.

---

## Notes

- Keep migrations minimal and idempotent; for larger schema evolution consider adding a small `migrations` table to track versions (future work).

````