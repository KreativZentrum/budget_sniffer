import pathlib
import pytest

from budget_sniffer.ingest.adapters import xlsx as xlsx_adapter
from budget_sniffer.ingest import normalizer


FIXTURES = pathlib.Path('tests/fixtures/ingest')


@pytest.mark.skipif(not any(FIXTURES.glob('*.xlsx')), reason='no xlsx fixtures')
def test_xlsx_adapter_parses_and_normalizes():
    xlsx_files = sorted(FIXTURES.glob('*.xlsx'))
    assert xlsx_files, 'expected at least one xlsx fixture'
    src = xlsx_files[0]

    rows = xlsx_adapter.parse_xlsx(str(src))
    assert isinstance(rows, list) and rows, 'adapter should return non-empty list'

    canon = normalizer.normalize(rows[0])
    assert 'fingerprint' in canon and len(canon['fingerprint']) == 64
