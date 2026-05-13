from __future__ import annotations

import os
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def build_database_url() -> str:
    return os.getenv("DATABASE_URL", "sqlite:///./law.db")


def build_engine():
    url = build_database_url()
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, future=True)


engine = build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_session() -> Iterator:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
