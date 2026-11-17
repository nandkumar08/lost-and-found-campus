"""
Managed MySQL connection pool built on PyMySQL.

* Fixed-size pool with health checks and automatic recycling.
* Context manager guarantees commit / rollback / return-to-pool.
* Every caller uses parameterized queries; this module never builds SQL from
  user input.
"""
from __future__ import annotations

import logging
import queue
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pymysql
from pymysql.cursors import DictCursor

from app.config import settings

logger = logging.getLogger("lfc.db")


class ConnectionPool:
    def __init__(self, size: int = 8) -> None:
        self._size = max(1, size)
        self._pool: "queue.LifoQueue[pymysql.connections.Connection]" = queue.LifoQueue(
            maxsize=self._size
        )
        self._lock = threading.Lock()
        self._created = 0

    # -- low level ---------------------------------------------------------
    def _new_connection(self) -> pymysql.connections.Connection:
        conn = pymysql.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
            connect_timeout=10,
            read_timeout=30,
            write_timeout=30,
            init_command="SET SESSION sql_mode='STRICT_ALL_TABLES'",
        )
        conn.autocommit(False)
        return conn

    def _acquire(self) -> pymysql.connections.Connection:
        try:
            conn = self._pool.get_nowait()
            try:
                conn.ping(reconnect=False)
                return conn
            except Exception:  # stale connection — drop it from the pool budget
                try:
                    conn.close()
                except Exception:
                    pass
                with self._lock:
                    self._created = max(0, self._created - 1)
        except queue.Empty:
            pass

        with self._lock:
            if self._created < self._size:
                self._created += 1
                return self._new_connection()
        # Pool saturated: block briefly for a free connection.
        try:
            conn = self._pool.get(timeout=10)
        except queue.Empty as exc:  # pragma: no cover - extreme load
            raise RuntimeError("Database connection pool exhausted") from exc
        try:
            conn.ping(reconnect=True)
        except Exception as exc:
            self._release(conn, broken=True)
            raise RuntimeError("Could not obtain a healthy database connection") from exc
        return conn

    def _release(self, conn: pymysql.connections.Connection, broken: bool = False) -> None:
        if broken:
            with self._lock:
                self._created = max(0, self._created - 1)
            try:
                conn.close()
            except Exception:
                pass
            return
        try:
            self._pool.put_nowait(conn)
        except queue.Full:  # pragma: no cover
            conn.close()

    # -- public API --------------------------------------------------------
    @contextmanager
    def connection(self):
        conn = self._acquire()
        broken = False
        try:
            yield conn
        except pymysql.MySQLError:
            broken = True
            raise
        finally:
            # Even read-only work opens an implicit transaction under InnoDB's
            # REPEATABLE READ. Ending it before returning the connection keeps
            # pooled sessions from pinning a snapshot (which surfaces as
            # "Record has changed since last read" for other sessions).
            if not broken:
                try:
                    conn.rollback()
                except Exception:
                    broken = True
            self._release(conn, broken=broken)

    @contextmanager
    def transaction(self):
        """Commit on success, roll back on any exception."""
        conn = self._acquire()
        broken = False
        try:
            try:
                yield conn
                conn.commit()
            except Exception:
                if isinstance(conn, pymysql.connections.Connection) and not conn.open:
                    broken = True
                try:
                    conn.rollback()
                except Exception:
                    broken = True
                raise
        finally:
            self._release(conn, broken=broken)

    # -- query helpers -----------------------------------------------------
    # Transient MySQL errors that are safe to retry for idempotent reads and
    # for writes that are retried as a whole unit.
    _TRANSIENT = {1020, 1213, 1205, 2006, 2013}

    def _run(self, fn, attempts: int = 3):
        last: Optional[Exception] = None
        for attempt in range(attempts):
            try:
                return fn()
            except pymysql.err.OperationalError as exc:
                if exc.args and exc.args[0] in self._TRANSIENT and attempt < attempts - 1:
                    last = exc
                    time.sleep(0.05 * (attempt + 1))
                    continue
                raise
        if last:
            raise last
        raise RuntimeError("query retry loop exhausted")

    def query_all(self, sql: str, params: Sequence[Any] | Dict[str, Any] | None = None) -> List[dict]:
        def run() -> List[dict]:
            with self.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, params or ())
                    return list(cur.fetchall())

        return self._run(run)

    def query_one(self, sql: str, params: Sequence[Any] | Dict[str, Any] | None = None) -> Optional[dict]:
        def run() -> Optional[dict]:
            with self.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, params or ())
                    return cur.fetchone()

        return self._run(run)

    def execute(self, sql: str, params: Sequence[Any] | Dict[str, Any] | None = None) -> int:
        def run() -> int:
            with self.transaction() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, params or ())
                    return cur.lastrowid if cur.lastrowid else cur.rowcount

        return self._run(run)

    def execute_many(self, sql: str, rows: Iterable[Sequence[Any]]) -> int:
        with self.transaction() as conn:
            with conn.cursor() as cur:
                cur.executemany(sql, list(rows))
                return cur.rowcount

    def scalar(self, sql: str, params: Sequence[Any] | Dict[str, Any] | None = None, default: Any = None) -> Any:
        row = self.query_one(sql, params)
        if not row:
            return default
        return next(iter(row.values()))

    def health(self) -> bool:
        try:
            self.query_one("SELECT 1 AS ok")
            return True
        except Exception as exc:  # pragma: no cover
            logger.error("Database health check failed: %s", exc)
            return False


pool = ConnectionPool(settings.DB_POOL_SIZE)


def get_db() -> ConnectionPool:
    """FastAPI dependency returning the shared pool."""
    return pool
