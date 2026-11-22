"""Idempotent pure-Python PostgreSQL schema & table verifier/initializer using SQLAlchemy 2.0."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from python_backend.app.core.config import PROJECT_ROOT
from python_backend.app.core.database import SessionLocal, engine, ping_database
from python_backend.app.models.models import Base, Category, PlatformConfig, Product, User


def init_database() -> dict[str, int | bool]:
    """Ensure schema exists if empty, apply column guards, and report row counts."""
    schema_path = PROJECT_ROOT / "database" / "schema.sql"
    db = SessionLocal()
    try:
        ping_database(db)

        has_users_table = db.execute(
            text(
                "SELECT EXISTS ("
                "  SELECT 1 FROM information_schema.tables "
                "  WHERE table_schema = 'public' AND table_name = 'users'"
                ")"
            )
        ).scalar()

        if not has_users_table and schema_path.exists():
            sql_text = schema_path.read_text(encoding="utf-8")
            with engine.begin() as conn:
                conn.exec_driver_sql(sql_text)
        elif not has_users_table:
            Base.metadata.create_all(bind=engine)

        # Ensure PlatformConfig default row exists
        cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
        if not cfg:
            db.add(PlatformConfig(id="default"))
            db.commit()

        return {
            "databaseConnected": True,
            "usersCount": db.query(User).count(),
            "categoriesCount": db.query(Category).count(),
            "productsCount": db.query(Product).count(),
        }
    finally:
        db.close()


if __name__ == "__main__":
    summary = init_database()
    print("STRIDERA PostgreSQL Init Summary:", summary)
