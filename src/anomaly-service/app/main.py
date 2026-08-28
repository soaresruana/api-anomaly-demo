import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.persistence.database import (
    initialize_database,
    save_processed_event,
)
from app.schemas import (
    AnomalyDetection,
    EventResponse,
    RequestEvent,
)
from app.services.anomaly_detector import AnomalyDetector
from app.services.behavior_tracker import BehaviorTracker
from app.services.model_artifact import (
    get_model_artifact_path,
)


logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("anomaly-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()

    artifact_path = get_model_artifact_path()

    if artifact_path.exists():
        app.state.anomaly_detector = (
            AnomalyDetector.from_artifact_file()
        )

        logger.info(
            "anomaly_detector_loaded path=%s",
            artifact_path,
        )
    else:
        app.state.anomaly_detector = None

        logger.warning(
            "anomaly_detector_not_loaded "
            "artifact_not_found path=%s",
            artifact_path,
        )

    yield


app = FastAPI(
    title="Anomaly Service",
    version="0.4.0",
    lifespan=lifespan,
)


behavior_tracker = BehaviorTracker()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": (
            app.state.anomaly_detector
            is not None
        ),
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

    result = await behavior_tracker.process(
        event
    )

    logger.info(
        "features_computed %s",
        result.model_dump_json(),
    )

    if (
        result.eligible_for_model
        and result.features is not None
    ):
        detector = app.state.anomaly_detector

        if detector is not None:
            detection_result = await asyncio.to_thread(
                detector.predict,
                result.features,
            )

            result = result.model_copy(
                update={
                    "detection": AnomalyDetection(
                        classification=(
                            detection_result.classification
                        ),
                        is_anomaly=(
                            detection_result.is_anomaly
                        ),
                        score=detection_result.score,
                        threshold=detection_result.threshold,
                    )
                }
            )

            logger.info(
                "anomaly_detection "
                "request_id=%s "
                "classification=%s "
                "score=%s "
                "threshold=%s",
                event.request_id,
                detection_result.classification,
                detection_result.score,
                detection_result.threshold,
            )
        else:
            logger.warning(
                "anomaly_detection_skipped "
                "request_id=%s "
                "reason=model_not_loaded",
                event.request_id,
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