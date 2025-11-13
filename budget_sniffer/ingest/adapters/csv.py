import csv as _csv
from decimal import Decimal, InvalidOperation
from typing import List, Dict


def parse_csv(path: str) -> List[Dict]:
    """Parse a CSV bank export into a list of raw record dicts.

    This is a forgiving parser that returns the raw row as a dict and
    canonicalizes a few fields for downstream normalization.
    """
    rows = []
    with open(path, newline='', encoding='utf-8', errors='replace') as fh:
        reader = _csv.DictReader(fh)
        for row in reader:
            # basic cleanup: strip whitespace from keys and values
            clean = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}

            # best-effort amount parsing: keep raw string and parsed Decimal
            amt_raw = clean.get('Amount') or clean.get(' amount') or clean.get('Amount ')
            amt = None
            if amt_raw:
                try:
                    # Remove commas and any currency symbols
                    amt = Decimal(amt_raw.replace(',', '').replace('$', '').strip())
                except (InvalidOperation, AttributeError):
                    amt = None

            # pick a payee-like field from common columns
            payee = clean.get('Details') or clean.get('Particulars') or clean.get('Reference') or clean.get('Type') or ''

            rows.append({
                'raw': clean,
                'date': clean.get('Date'),
                'amount': str(amt) if amt is not None else None,
                'amount_cents': int((amt * 100).to_integral_value()) if amt is not None else None,
                'payee': payee,
                'import_source': path,
            })
    return rows
