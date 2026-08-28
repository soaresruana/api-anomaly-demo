from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.persistence.dataset_repository import (
    DatasetRecord,
    load_test_dataset,
    load_training_dataset,
    load_validation_dataset,
)
from app.services.feature_preprocessor import (
    build_feature_preprocessor,
    records_to_raw_features,
)
from app.services.isolation_forest_model import (
    build_isolation_forest,
)
from app.services.threshold_calibration import (
    ThresholdCalibrationResult,
    calibrate_threshold,
)


@dataclass(frozen=True, slots=True)
class EvaluationMetrics:
    total: int
    normal: int
    anomaly: int
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int
    precision: float | None
    recall: float | None
    f1_score: float | None
    false_positive_rate: float | None
    accuracy: float


@dataclass(frozen=True, slots=True)
class RunEvaluation:
    run_id: str
    metrics: EvaluationMetrics
    predicted_anomaly: int
    score_min: float
    score_p50: float
    score_max: float


@dataclass(frozen=True, slots=True)
class ModelEvaluationResult:
    calibration: ThresholdCalibrationResult
    validation_metrics: EvaluationMetrics
    test_metrics: EvaluationMetrics
    test_runs: tuple[RunEvaluation, ...]


def _safe_divide(
    numerator: int,
    denominator: int,
) -> float | None:
    if denominator == 0:
        return None

    return numerator / denominator


def calculate_metrics(
    records: Sequence[DatasetRecord],
    predictions: np.ndarray,
) -> EvaluationMetrics:
    if not records:
        raise ValueError(
            "Evaluation dataset cannot be empty."
        )

    predicted = np.asarray(
        predictions,
        dtype=np.int64,
    )

    if predicted.ndim != 1:
        raise ValueError(
            "Predictions must be a one-dimensional array."
        )

    if len(records) != len(predicted):
        raise ValueError(
            "Records and predictions must have "
            "the same length."
        )

    if not np.isin(
        predicted,
        (0, 1),
    ).all():
        raise ValueError(
            "Predictions must contain only "
            "0 or 1."
        )

    expected = np.asarray(
        [
            1
            if record.expected_class == "anomaly"
            else 0
            for record in records
        ],
        dtype=np.int64,
    )

    true_positive = int(
        (
            (expected == 1)
            & (predicted == 1)
        ).sum()
    )

    false_positive = int(
        (
            (expected == 0)
            & (predicted == 1)
        ).sum()
    )

    true_negative = int(
        (
            (expected == 0)
            & (predicted == 0)
        ).sum()
    )

    false_negative = int(
        (
            (expected == 1)
            & (predicted == 0)
        ).sum()
    )

    precision = _safe_divide(
        true_positive,
        true_positive + false_positive,
    )

    recall = _safe_divide(
        true_positive,
        true_positive + false_negative,
    )

    if precision is None or recall is None:
        f1_score = None
    elif precision + recall == 0:
        f1_score = 0.0
    else:
        f1_score = (
            2
            * precision
            * recall
            / (precision + recall)
        )

    false_positive_rate = _safe_divide(
        false_positive,
        false_positive + true_negative,
    )

    accuracy = (
        true_positive + true_negative
    ) / len(records)

    return EvaluationMetrics(
        total=len(records),
        normal=int(
            (expected == 0).sum()
        ),
        anomaly=int(
            (expected == 1).sum()
        ),
        true_positive=true_positive,
        false_positive=false_positive,
        true_negative=true_negative,
        false_negative=false_negative,
        precision=precision,
        recall=recall,
        f1_score=f1_score,
        false_positive_rate=false_positive_rate,
        accuracy=accuracy,
    )


def run_model_evaluation() -> ModelEvaluationResult:
    # TRAIN and VALIDATION are loaded first.
    # TEST is intentionally kept outside the
    # training and threshold calibration process.
    train = load_training_dataset()
    validation = load_validation_dataset()

    preprocessor = build_feature_preprocessor()

    x_train = preprocessor.fit_transform(
        records_to_raw_features(train)
    )

    x_validation = preprocessor.transform(
        records_to_raw_features(validation)
    )

    model = build_isolation_forest()

    model.fit(
        x_train
    )

    validation_scores = model.score_samples(
        x_validation
    )

    calibration = calibrate_threshold(
        validation,
        validation_scores,
    )

    validation_predictions = (
        validation_scores
        < calibration.threshold
    ).astype(
        np.int64
    )

    validation_metrics = calculate_metrics(
        validation,
        validation_predictions,
    )

    # TEST is loaded only after the model and
    # calibrated threshold have been defined.
    test = load_test_dataset()

    x_test = preprocessor.transform(
        records_to_raw_features(test)
    )

    test_scores = model.score_samples(
        x_test
    )

    test_predictions = (
        test_scores
        < calibration.threshold
    ).astype(
        np.int64
    )

    test_metrics = calculate_metrics(
        test,
        test_predictions,
    )

    grouped: dict[
        str,
        list[
            tuple[
                DatasetRecord,
                float,
                int,
            ]
        ],
    ] = defaultdict(list)

    for record, score, prediction in zip(
        test,
        test_scores,
        test_predictions,
        strict=True,
    ):
        grouped[
            record.run_id
        ].append(
            (
                record,
                float(score),
                int(prediction),
            )
        )

    run_results: list[RunEvaluation] = []

    for run_id in sorted(grouped):
        rows = grouped[
            run_id
        ]

        run_records = [
            row[0]
            for row in rows
        ]

        run_scores = np.asarray(
            [
                row[1]
                for row in rows
            ],
            dtype=np.float64,
        )

        run_predictions = np.asarray(
            [
                row[2]
                for row in rows
            ],
            dtype=np.int64,
        )

        run_metrics = calculate_metrics(
            run_records,
            run_predictions,
        )

        run_results.append(
            RunEvaluation(
                run_id=run_id,
                metrics=run_metrics,
                predicted_anomaly=int(
                    (
                        run_predictions == 1
                    ).sum()
                ),
                score_min=float(
                    run_scores.min()
                ),
                score_p50=float(
                    np.percentile(
                        run_scores,
                        50,
                    )
                ),
                score_max=float(
                    run_scores.max()
                ),
            )
        )

    return ModelEvaluationResult(
        calibration=calibration,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        test_runs=tuple(
            run_results
        ),
    )


def _print_metrics(
    name: str,
    metrics: EvaluationMetrics,
) -> None:
    print(name)

    print(
        f"total={metrics.total}"
    )

    print(
        f"normal={metrics.normal}"
    )

    print(
        f"anomaly={metrics.anomaly}"
    )

    print(
        "TP="
        f"{metrics.true_positive} "
        "FP="
        f"{metrics.false_positive} "
        "TN="
        f"{metrics.true_negative} "
        "FN="
        f"{metrics.false_negative}"
    )

    print(
        f"precision={metrics.precision}"
    )

    print(
        f"recall={metrics.recall}"
    )

    print(
        f"f1={metrics.f1_score}"
    )

    print(
        "fpr="
        f"{metrics.false_positive_rate}"
    )

    print(
        f"accuracy={metrics.accuracy}"
    )


def main() -> None:
    result = run_model_evaluation()

    thresholds_by_run = dict(
        sorted(
            result.calibration
            .thresholds_by_run.items()
        )
    )

    print(
        "threshold="
        f"{result.calibration.threshold}"
    )

    print(
        "thresholds_by_run="
        f"{thresholds_by_run}"
    )

    print()

    _print_metrics(
        "VALIDATION_CALIBRATION",
        result.validation_metrics,
    )

    print()

    _print_metrics(
        "TEST",
        result.test_metrics,
    )

    print()

    print("PER_RUN")

    for run in result.test_runs:
        metrics = run.metrics

        print(
            run.run_id,
            f"n={metrics.total}",
            f"normal={metrics.normal}",
            f"anomaly={metrics.anomaly}",
            (
                "predicted_anomaly="
                f"{run.predicted_anomaly}"
            ),
            f"TP={metrics.true_positive}",
            f"FP={metrics.false_positive}",
            f"TN={metrics.true_negative}",
            f"FN={metrics.false_negative}",
            f"precision={metrics.precision}",
            f"recall={metrics.recall}",
            f"f1={metrics.f1_score}",
            (
                "fpr="
                f"{metrics.false_positive_rate}"
            ),
            f"accuracy={metrics.accuracy}",
            f"score_min={run.score_min}",
            f"score_p50={run.score_p50}",
            f"score_max={run.score_max}",
        )


if __name__ == "__main__":
    main()