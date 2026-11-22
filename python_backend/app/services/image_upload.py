"""Safe product image upload utility with magic-byte validation matching Node imageUpload.js."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ..core.config import PROJECT_ROOT

UPLOAD_ROOT = PROJECT_ROOT / "backend" / "public" / "uploads" / "products"
MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_FILES_PER_PRODUCT = 6


def detect_image_extension(data: bytes) -> str | None:
    if len(data) < 12:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


async def save_uploaded_images(files: list[UploadFile]) -> list[dict[str, str]]:
    if len(files) > MAX_FILES_PER_PRODUCT:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES_PER_PRODUCT} images per upload.")

    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    saved: list[dict[str, str]] = []

    for f in files:
        raw = await f.read()
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="File size exceeds 2MB limit")
        ext = detect_image_extension(raw)
        if not ext:
            raise HTTPException(status_code=400, detail="Only PNG, JPEG, and WEBP image files are allowed")
        filename = f"{uuid.uuid4()}.{ext}"
        dest = UPLOAD_ROOT / filename
        dest.write_bytes(raw)
        saved.append({"url": f"/uploads/products/{filename}", "filename": filename})

    return saved
