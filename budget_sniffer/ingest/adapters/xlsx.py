from typing import List, Dict
import pandas as pd
from decimal import Decimal


def parse_xlsx(path: str, sheet_name=0) -> List[Dict]:
    """Parse an XLSX bank export into a list of raw record dicts.

    Uses pandas.read_excel to read the first sheet by default. Returns a list of
    dicts with keys compatible with the CSV adapter: raw, date, amount, amount_cents, payee, import_source
    """
    df = pd.read_excel(path, sheet_name=sheet_name, engine='openpyxl')

    # Normalize column names to strings and strip
    df.columns = [str(c).strip() for c in df.columns]

    rows = []
    for _, r in df.iterrows():
        # convert row to dict with string keys
        raw = {str(k): (v if not pd.isna(v) else None) for k, v in r.items()}

        # attempt to find common columns
        date = raw.get('Date') or raw.get('date')
        payee = raw.get('Details') or raw.get('Particulars') or raw.get('Reference') or raw.get('Type') or ''

        # amount heuristics: try common column names
        amt_raw = raw.get('Amount') or raw.get('Amount NZD') or raw.get('ForeignCurrencyAmount') or raw.get('amount')
        amt = None
        if amt_raw is not None:
            try:
                amt = Decimal(str(amt_raw)).quantize(Decimal('0.01'))
            except Exception:
                amt = None

        rows.append({
            'raw': raw,
            'date': date,
            'amount': str(amt) if amt is not None else None,
            'amount_cents': int((amt * 100).to_integral_value()) if amt is not None else None,
            'payee': str(payee) if payee is not None else '',
            'import_source': path,
        })

    return rows
