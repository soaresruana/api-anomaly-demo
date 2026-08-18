import os
import sqlite3
from pathlib import Path

from app.schemas import EventResponse, RequestEvent


DEFAULT_DB_PATH = "data/experiment.db"


def get_db_path() -> Path:
    return Path(
        os.getenv(
            "EXPERIMENT_DB_PATH",
            DEFAULT_DB_PATH,
        )
    )


def configure_connection(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        "PRAGMA foreign_keys = ON;"
    )

    connection.execute(
        "PRAGMA busy_timeout = 5000;"
    )


def initialize_database() -> None:
    db_path = get_db_path()

    db_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with sqlite3.connect(
        db_path,
        timeout=5.0,
    ) as connection:

        configure_connection(connection)

        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS request_events (
                request_id TEXT PRIMARY KEY,
                run_id TEXT,
                client_id TEXT,
                timestamp_ms INTEGER NOT NULL,
                http_method TEXT NOT NULL,
                request_path TEXT NOT NULL,
                payload_size_bytes INTEGER NOT NULL,
                query_param_count INTEGER NOT NULL,
                scenario TEXT,
                expected_class TEXT,
                created_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS behavioral_features (
                request_id TEXT PRIMARY KEY,
                http_method TEXT NOT NULL,
                route TEXT NOT NULL,
                payload_size_bytes INTEGER NOT NULL,
                query_param_count INTEGER NOT NULL,
                inter_arrival_ms INTEGER,
                requests_last_10s INTEGER NOT NULL,
                distinct_routes_last_30s INTEGER NOT NULL,
                eligible_for_model INTEGER NOT NULL,
                reason TEXT,
                FOREIGN KEY (request_id)
                    REFERENCES request_events(request_id)
                    ON DELETE CASCADE
            );
            """
        )


def save_processed_event(
    event: RequestEvent,
    result: EventResponse,
) -> None:

    db_path = get_db_path()

    with sqlite3.connect(
        db_path,
        timeout=5.0,
    ) as connection:

        configure_connection(connection)

        connection.execute(
            """
            INSERT INTO request_events (
                request_id,
                run_id,
                client_id,
                timestamp_ms,
                http_method,
                request_path,
                payload_size_bytes,
                query_param_count,
                scenario,
                expected_class
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.request_id,
                event.run_id,
                event.client_id,
                event.timestamp_ms,
                event.http_method,
                event.request_path,
                event.payload_size_bytes,
                event.query_param_count,
                event.scenario,
                event.expected_class,
            ),
        )

        if result.features is None:
            return

        features = result.features

        connection.execute(
            """
            INSERT INTO behavioral_features (
                request_id,
                http_method,
                route,
                payload_size_bytes,
                query_param_count,
                inter_arrival_ms,
                requests_last_10s,
                distinct_routes_last_30s,
                eligible_for_model,
                reason
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.request_id,
                features.http_method,
                features.route,
                features.payload_size_bytes,
                features.query_param_count,
                features.inter_arrival_ms,
                features.requests_last_10s,
                features.distinct_routes_last_30s,
                int(result.eligible_for_model),
                result.reason,
            ),
        )