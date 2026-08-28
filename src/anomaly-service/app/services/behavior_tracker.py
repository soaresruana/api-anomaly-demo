import asyncio
from collections import deque
from dataclasses import dataclass, field

from app.schemas import (
    BehavioralFeatures,
    EventResponse,
    RequestEvent,
)
from app.services.route_normalizer import normalize_route


TEN_SECONDS_MS = 10_000
THIRTY_SECONDS_MS = 30_000


@dataclass
class RecentEvent:
    timestamp_ms: int
    route: str


@dataclass
class ClientState:
    last_request_at_ms: int | None = None
    events: deque[RecentEvent] = field(default_factory=deque)


class BehaviorTracker:
    def __init__(self) -> None:
        self._clients: dict[tuple[str, str], ClientState] = {}
        self._lock = asyncio.Lock()

    async def process(
        self,
        event: RequestEvent,
    ) -> EventResponse:

        if not event.client_id:
            return EventResponse(
                status="skipped",
                request_id=event.request_id,
                eligible_for_model=False,
                reason="missing_client_id",
            )

        if not event.run_id:
            return EventResponse(
                status="skipped",
                request_id=event.request_id,
                eligible_for_model=False,
                reason="missing_run_id",
            )

        normalized_route = normalize_route(event.request_path)

        state_key = (
            event.run_id,
            event.client_id,
        )

        async with self._lock:
            state = self._clients.setdefault(
                state_key,
                ClientState(),
            )

            if (
                state.last_request_at_ms is not None
                and event.timestamp_ms < state.last_request_at_ms
            ):
                return EventResponse(
                    status="skipped",
                    request_id=event.request_id,
                    eligible_for_model=False,
                    reason="out_of_order_timestamp",
                )

            window_30s_start = (
                event.timestamp_ms - THIRTY_SECONDS_MS
            )

            while (
                state.events
                and state.events[0].timestamp_ms
                < window_30s_start
            ):
                state.events.popleft()

            if state.last_request_at_ms is None:
                inter_arrival_ms = None
            else:
                inter_arrival_ms = (
                    event.timestamp_ms
                    - state.last_request_at_ms
                )

            state.events.append(
                RecentEvent(
                    timestamp_ms=event.timestamp_ms,
                    route=normalized_route,
                )
            )

            state.last_request_at_ms = event.timestamp_ms

            window_10s_start = (
                event.timestamp_ms - TEN_SECONDS_MS
            )

            requests_last_10s = sum(
                1
                for recent_event in state.events
                if recent_event.timestamp_ms >= window_10s_start
            )

            distinct_routes_last_30s = len(
                {
                    recent_event.route
                    for recent_event in state.events
                }
            )

            features = BehavioralFeatures(
                http_method=event.http_method,
                route=normalized_route,
                payload_size_bytes=event.payload_size_bytes,
                query_param_count=event.query_param_count,
                inter_arrival_ms=inter_arrival_ms,
                requests_last_10s=requests_last_10s,
                distinct_routes_last_30s=(
                    distinct_routes_last_30s
                ),
            )

            if inter_arrival_ms is None:
                return EventResponse(
                    status="accepted",
                    request_id=event.request_id,
                    eligible_for_model=False,
                    reason="warmup",
                    features=features,
                )

            return EventResponse(
                status="accepted",
                request_id=event.request_id,
                eligible_for_model=True,
                features=features,
            )