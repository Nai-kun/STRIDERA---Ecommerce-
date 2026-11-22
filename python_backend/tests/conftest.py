"""Shared pytest fixtures exposing FastAPI TestClient against PostgreSQL."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from python_backend.app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as tc:
        yield tc
