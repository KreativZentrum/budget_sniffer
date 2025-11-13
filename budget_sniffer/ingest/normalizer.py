from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
from typing import Dict


def normalize(raw: Dict) -> Dict:
    """Normalize a raw record (from an adapter) into the canonical transaction shape.

    Expected input keys (from csv adapter): date (D/M/Y or Y-M-D), amount_cents (int or string), payee, raw
    Returns a dict with at least: date (YYYY-MM-DD), amount_cents (int), payee (str), fingerprint (str)
    """
    # normalize date
    date_raw = raw.get('date')
    date_out = None
    if date_raw:
        for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
            try:
                dt = datetime.strptime(date_raw, fmt)
                date_out = dt.date().isoformat()
                break
            except Exception:
                continue

    # normalize amount_cents
    amt_cents = raw.get('amount_cents')
    if isinstance(amt_cents, str):
        try:
            amt_cents = int(Decimal(amt_cents) * 100)
        except (InvalidOperation, ValueError):
            amt_cents = None

    # normalize payee
    payee = raw.get('payee') or ''
    payee_norm = ' '.join(payee.split()).strip()

    canonical = {
        'date': date_out,
        'amount_cents': int(amt_cents) if amt_cents is not None else None,
        'payee': payee_norm,
        'raw': raw.get('raw'),
    }
    canonical['fingerprint'] = fingerprint(canonical)
    return canonical


def fingerprint(canonical: Dict) -> str:
    """Compute a deterministic fingerprint from canonical fields.

    Uses date|amount_cents|normalized_payee lowercased and stripped. Returns hex sha256.
    """
    date = canonical.get('date') or ''
    amt = canonical.get('amount_cents')
    amt_s = str(int(amt)) if amt is not None else ''
    payee = (canonical.get('payee') or '').strip().lower()
    key = f"{date}|{amt_s}|{payee}"
    return hashlib.sha256(key.encode('utf-8')).hexdigest()
