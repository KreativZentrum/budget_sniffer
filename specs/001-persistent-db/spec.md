# 001-persistent-db — Persistent DB: check for existing DB before init

## Summary
Ensure the application checks for an existing SQLite DB file before creating/initializing a new one. If an existing DB is present, do not replace it; instead verify schema and apply idempotent migrations (e.g., add missing `hidden` column). Fail loudly on unrecoverable errors.

## Motivation
Prevent data loss and unexpected re-initialisation when the app runs on a machine with an existing database.

## Requirements
- On startup (init_db), the app must:
  - Detect whether the DB file at `budget_sniffer.db` exists.
  - If the file does not exist: create DB and apply `schema.sql`.
  - If the file exists:
    - If `transactions` table missing → apply `schema.sql`.
    - If `transactions` table exists → perform lightweight, idempotent migrations (e.g., add `hidden` column if absent).
  - Log actions (created DB / verified schema / added migrations / errors) to `logs/app.log`.
- No existing data must be deleted automatically.
- Provide developer mechanism to force recreate DB (explicit opt-in, e.g., env var or CLI) — separate change (documented).

## Acceptance criteria
- Running the app with no `budget_sniffer.db` creates the DB and initializes tables (verify file is created and `transactions` table exists).
- Running the app with a valid DB leaves existing rows intact and does not overwrite data; it verifies schema and adds missing columns if needed.
- Running the app with an empty DB file (file exists but table missing) initializes the schema into that file.
- All actions are logged; errors are visible in `logs/app.log`.
- Tests:
  - Unit/integration tests simulate: no-file, empty-file, existing DB with missing column. All should pass.

## Tests (manual)
1. Backup any existing `budget_sniffer.db`.
2. Remove DB: `rm -f budget_sniffer.db`. Run `python app.py` and verify `budget_sniffer.db` created and `transactions` table exists.
3. Create empty file: `touch budget_sniffer.db`. Run `python app.py` and verify schema created.
4. Create DB without `hidden` column (older schema): run app and verify `hidden` column added.
5. With populated DB, run app and verify no data loss.

## Migration & Rollout
- Merge to `main` after code + tests pass.
- Communicate to users: this is a non-destructive change; existing DBs will be preserved.
