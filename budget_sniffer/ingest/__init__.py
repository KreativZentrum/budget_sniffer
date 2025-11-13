"""Ingestion package for budget_sniffer.

This package provides adapter implementations and normalization utilities.
"""

from . import adapters  # noqa: F401
from . import normalizer  # noqa: F401

__all__ = ["adapters", "normalizer"]
