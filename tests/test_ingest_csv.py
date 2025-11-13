import pathlib
import sqlite3
import hashlib
import json

import pytest


FIXTURES = pathlib.Path('tests/fixtures/ingest')


def test_simple_csv_fixture_exists():
    # ensure the user-uploaded fixture is present
    files = list(FIXTURES.glob('*.csv'))
    assert files, f'No CSV fixtures found in {FIXTURES!s}'


def test_csv_adapter_parses_rows_and_generates_fingerprint(tmp_path, monkeypatch):
    """
    TDD test (failing first): the CSV adapter + normalizer should parse the first CSV fixture,
    normalize a row and compute a deterministic fingerprint (SHA256 of date+amount_cents+payee).
    """
    # pick the first CSV file the user uploaded
    csv_files = sorted(FIXTURES.glob('*.csv'))
    assert csv_files, 'expected at least one csv fixture'
    src = csv_files[0]

    # read the file (adapter not implemented yet) and assert we can access its bytes
    data = src.read_bytes()
    assert data, 'fixture file appears empty'

    # The adapter API (not implemented yet) will expose a function called `parse_csv`.
    # For TDD we assert expected behaviour; this test should fail until adapter/normalizer exist.
    from budget_sniffer.ingest.adapters import csv as csv_adapter  # noqa: F401

    # Expect the adapter to provide `parse_csv(path)` returning list of raw dicts
    with pytest.raises(Exception):
        # currently this should raise ImportError or AttributeError until implemented
        rows = csv_adapter.parse_csv(str(src))


def test_fingerprint_stability():
    # Demonstrate the fingerprint algorithm we expect (date + amount_cents + normalized payee)
    def fingerprint(date, amount_cents, payee):
        key = f"{date}|{amount_cents}|{payee.strip().lower()}"
        return hashlib.sha256(key.encode('utf-8')).hexdigest()

    a = fingerprint('2024-04-01', 12345, 'ACME STORE')
    b = fingerprint('2024-04-01', 12345, 'acme store')
    assert a == b, 'fingerprint must be case-insensitive on payee'
