"""CLI server runner for STRIDERA Python FastAPI back-end."""

from __future__ import annotations

import os
import uvicorn

from python_backend.app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run(
        "python_backend.app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=reload_enabled,
        log_level="info",
    )


if __name__ == "__main__":
    main()
