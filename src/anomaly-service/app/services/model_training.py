from dataclasses import dataclass
from pathlib import Path

from app.persistence.dataset_repository import (
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
from app.services.model_artifact import (
    ModelArtifact,
    save_model_artifact,
)
from app.services.threshold_calibration import (
    TARGET_FALSE_POSITIVE_RATE,
    ThresholdCalibrationResult,
    calibrate_threshold,
)


@dataclass(frozen=True, slots=True)
class ModelTrainingResult:
    artifact_path: Path
    training_records: int
    validation_records: int
    calibration: ThresholdCalibrationResult


def train_and_save_model() -> ModelTrainingResult:
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
        target_fpr=TARGET_FALSE_POSITIVE_RATE,
    )

    artifact = ModelArtifact(
        preprocessor=preprocessor,
        model=model,
        threshold=calibration.threshold,
        target_fpr=TARGET_FALSE_POSITIVE_RATE,
    )

    artifact_path = save_model_artifact(
        artifact
    )

    return ModelTrainingResult(
        artifact_path=artifact_path,
        training_records=len(train),
        validation_records=len(validation),
        calibration=calibration,
    )


def main() -> None:
    result = train_and_save_model()

    print(
        "training_records="
        f"{result.training_records}"
    )

    print(
        "validation_records="
        f"{result.validation_records}"
    )

    print(
        "target_fpr="
        f"{TARGET_FALSE_POSITIVE_RATE}"
    )

    print(
        "threshold="
        f"{result.calibration.threshold}"
    )

    thresholds_by_run = dict(
        sorted(
            result.calibration
            .thresholds_by_run.items()
        )
    )

    print(
        "thresholds_by_run="
        f"{thresholds_by_run}"
    )

    print(
        "artifact_path="
        f"{result.artifact_path}"
    )


if __name__ == "__main__":
    main()