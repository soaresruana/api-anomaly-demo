import sqlite3
from dataclasses import dataclass
from typing import Literal

from app.persistence.database import (
    configure_connection,
    get_db_path,
)


TRAIN_RUN_IDS = (
    "train-navigation-002",
    "train-order-001",
    "train-order-lookup-001",
)

VALIDATION_RUN_IDS = (
    "validation-navigation-001",
    "validation-order-001",
    "validation-order-lookup-001",
)


TEST_RUN_IDS = (
    "test-normal-navigation-001",
    "test-normal-order-001",
    "test-normal-order-lookup-001",
    "test-anomaly-burst-001",
    "test-anomaly-payload-001",
    "test-anomaly-query-params-001",
    "test-anomaly-route-diversification-001",
    "test-anomaly-method-route-001",
)


@dataclass(frozen=True, slots=True)
class DatasetRecord:
    request_id: str

    run_id: str

    client_id: str

    scenario: str | None

    expected_class: Literal[
        "normal",
        "anomaly",
    ]

    timestamp_ms: int

    http_method: str

    route: str

    payload_size_bytes: int

    query_param_count: int

    inter_arrival_ms: int

    requests_last_10s: int

    distinct_routes_last_30s: int


def load_training_dataset() -> list[DatasetRecord]:
    return _load_dataset(
        TRAIN_RUN_IDS,
    )

def load_validation_dataset() -> list[DatasetRecord]:
    return _load_dataset(
        VALIDATION_RUN_IDS,
    )


def load_test_dataset() -> list[DatasetRecord]:
    return _load_dataset(
        TEST_RUN_IDS,
    )


def _load_dataset(
    run_ids: tuple[str, ...],
) -> list[DatasetRecord]:

    if not run_ids:
        return []

    placeholders = ", ".join(
        "?" for _ in run_ids
    )

    query = f"""
        SELECT
            r.request_id,
            r.run_id,
            r.client_id,
            r.scenario,
            r.expected_class,
            r.timestamp_ms,
            f.http_method,
            f.route,
            f.payload_size_bytes,
            f.query_param_count,
            f.inter_arrival_ms,
            f.requests_last_10s,
            f.distinct_routes_last_30s
        FROM request_events r
        INNER JOIN behavioral_features f
            ON f.request_id = r.request_id
        WHERE
            r.run_id IN ({placeholders})
            AND f.eligible_for_model = 1
        ORDER BY
            r.run_id,
            r.timestamp_ms,
            r.request_id
    """

    db_path = get_db_path()

    with sqlite3.connect(
        db_path,
        timeout=5.0,
    ) as connection:

        configure_connection(connection)

        connection.row_factory = sqlite3.Row

        rows = connection.execute(
            query,
            run_ids,
        ).fetchall()

    records: list[DatasetRecord] = []

    for row in rows:

        if row["run_id"] is None:
            raise ValueError(
                "Eligible dataset record "
                "has no run_id."
            )

        if row["client_id"] is None:
            raise ValueError(
                "Eligible dataset record "
                "has no client_id."
            )

        if row["expected_class"] not in (
            "normal",
            "anomaly",
        ):
            raise ValueError(
                "Eligible dataset record has "
                "invalid expected_class."
            )

        if row["inter_arrival_ms"] is None:
            raise ValueError(
                "Eligible dataset record has "
                "no inter_arrival_ms."
            )

        records.append(
            DatasetRecord(
                request_id=row["request_id"],
                run_id=row["run_id"],
                client_id=row["client_id"],
                scenario=row["scenario"],
                expected_class=row[
                    "expected_class"
                ],
                timestamp_ms=row[
                    "timestamp_ms"
                ],
                http_method=row[
                    "http_method"
                ],
                route=row["route"],
                payload_size_bytes=row[
                    "payload_size_bytes"
                ],
                query_param_count=row[
                    "query_param_count"
                ],
                inter_arrival_ms=row[
                    "inter_arrival_ms"
                ],
                requests_last_10s=row[
                    "requests_last_10s"
                ],
                distinct_routes_last_30s=row[
                    "distinct_routes_last_30s"
                ],
            )
        )

    return records