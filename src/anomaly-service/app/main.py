import logging
import asyncio

from fastapi import FastAPI

from app.schemas import EventResponse, RequestEvent
from app.services.behavior_tracker import BehaviorTracker

from contextlib import asynccontextmanager

from app.persistence.database import (
    initialize_database,
    save_processed_event,
)


logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("anomaly-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(
    title="Anomaly Service",
    version="0.3.0",
    lifespan=lifespan
)


behavior_tracker = BehaviorTracker()


@app.get("/health")
async def health():
    return {
        "status": "ok"
    }


@app.post(
    "/events",
    response_model=EventResponse,
)
async def receive_event(
    event: RequestEvent,
) -> EventResponse:

    logger.info(
        "event_received %s",
        event.model_dump_json(),
    )

    result = await behavior_tracker.process(event)

    logger.info(
        "features_computed %s",
        result.model_dump_json(),
    )

    try:
        await asyncio.to_thread(
            save_processed_event,
            event,
            result,
        )
    except Exception:
        logger.exception(
            "persistence_failed request_id=%s",
            event.request_id,
        )
        raise

    logger.info(
        "event_persisted request_id=%s",
        event.request_id,
    )

    return result