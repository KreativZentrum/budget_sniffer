import os
import sqlite3
import time
import app


def table_has_column(db_path, table, column):
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    cols = [r[1] for r in cur.fetchall()]
    con.close()
    return column in cols


def test_no_file(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    # Ensure no file
    if os.path.exists(db_file):
        os.remove(db_file)

    monkeypatch.setattr(app, "DB_PATH", db_file)
    # Ensure logs directory is writable
    monkeypatch.setattr(app, "LOGS_DIR", str(tmp_path / "logs"))
    os.makedirs(app.LOGS_DIR, exist_ok=True)

    # Run init
    app.init_db()

    assert os.path.exists(db_file)
    assert table_has_column(db_file, 'transactions', 'id')


def test_empty_file(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test2.db")
    # Create empty file
    open(db_file, 'a').close()

    monkeypatch.setattr(app, "DB_PATH", db_file)
    monkeypatch.setattr(app, "LOGS_DIR", str(tmp_path / "logs"))
    os.makedirs(app.LOGS_DIR, exist_ok=True)

    app.init_db()

    assert os.path.exists(db_file)
    assert table_has_column(db_file, 'transactions', 'id')


def test_add_hidden_column(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test3.db")
    # Create a DB with transactions table but without hidden column
    con = sqlite3.connect(db_file)
    cur = con.cursor()
    cur.execute('''
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_date TEXT NOT NULL,
            description TEXT,
            amount REAL NOT NULL,
            account TEXT,
            category TEXT,
            source_file TEXT,
            raw_json TEXT,
            hash TEXT UNIQUE,
            created_at TEXT DEFAULT (datetime('now'))
        );
    ''')
    con.commit()
    con.close()

    monkeypatch.setattr(app, "DB_PATH", db_file)
    monkeypatch.setattr(app, "LOGS_DIR", str(tmp_path / "logs"))
    os.makedirs(app.LOGS_DIR, exist_ok=True)

    # Ensure hidden column not present initially
    assert not table_has_column(db_file, 'transactions', 'hidden')

    app.init_db()

    # Now hidden column should be present
    assert table_has_column(db_file, 'transactions', 'hidden')
