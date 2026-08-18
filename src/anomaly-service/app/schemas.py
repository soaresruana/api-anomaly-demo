from typing import Literal

from pydantic import BaseModel, Field


class RequestEvent(BaseModel):
    request_id: str

    client_id: str | None = None

    run_id: str | None = None

    scenario: str | None = None

    expected_class: Literal["normal", "anomaly"] | None = None

    timestamp_ms: int = Field(ge=0)

    http_method: str

    request_path: str

    payload_size_bytes: int = Field(ge=0)

    query_param_count: int = Field(ge=0)


class BehavioralFeatures(BaseModel):
    http_method: str

    route: str

    payload_size_bytes: int

    query_param_count: int

    inter_arrival_ms: int | None

    requests_last_10s: int

    distinct_routes_last_30s: int


class EventResponse(BaseModel):
    status: Literal["accepted", "skipped"]

    request_id: str

    eligible_for_model: bool

    reason: str | None = None

    features: BehavioralFeatures | None = None