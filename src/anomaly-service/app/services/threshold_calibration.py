from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.persistence.dataset_repository import DatasetRecord


TARGET_FALSE_POSITIVE_RATE = 0.05


@dataclass(frozen=True, slots=True)
class ThresholdCalibrationResult:
    threshold: float

    thresholds_by_run: dict[str, float]


def calibrate_threshold(
    records: Sequence[DatasetRecord],
    scores: np.ndarray,
    target_fpr: float = TARGET_FALSE_POSITIVE_RATE,
) -> ThresholdCalibrationResult:

    if len(records) != len(scores):
        raise ValueError(
            "Records and scores must have "
            "the same length."
        )

    if not records:
        raise ValueError(
            "Validation dataset cannot be empty."
        )

    if not 0 < target_fpr < 1:
        raise ValueError(
            "target_fpr must be between 0 and 1."
        )

    grouped_scores: dict[str, list[float]] = (
        defaultdict(list)
    )

    for record, score in zip(
        records,
        scores,
        strict=True,
    ):
        if record.expected_class != "normal":
            raise ValueError(
                "Threshold calibration requires "
                "normal validation records only."
            )

        grouped_scores[
            record.run_id
        ].append(
            float(score)
        )

    thresholds_by_run = {
        run_id: float(
            np.quantile(
                np.asarray(
                    run_scores,
                    dtype=np.float64,
                ),
                target_fpr,
                method="inverted_cdf",
            )
        )
        for run_id, run_scores
        in grouped_scores.items()
    }

    threshold = min(
        thresholds_by_run.values()
    )

    return ThresholdCalibrationResult(
        threshold=threshold,
        thresholds_by_run=thresholds_by_run,
    )