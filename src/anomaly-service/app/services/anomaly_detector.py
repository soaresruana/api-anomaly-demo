from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.schemas import BehavioralFeatures
from app.services.feature_preprocessor import (
    behavioral_features_to_raw_features,
)
from app.services.model_artifact import (
    ModelArtifact,
    load_model_artifact,
)


@dataclass(frozen=True, slots=True)
class AnomalyDetectionResult:
    classification: Literal[
        "normal",
        "anomaly",
    ]

    is_anomaly: bool

    score: float

    threshold: float


class AnomalyDetector:
    def __init__(
        self,
        artifact: ModelArtifact,
    ) -> None:
        self._artifact = artifact

    @classmethod
    def from_artifact_file(
        cls,
    ) -> "AnomalyDetector":
        return cls(
            load_model_artifact()
        )

    @property
    def threshold(self) -> float:
        return self._artifact.threshold

    def predict(
        self,
        features: BehavioralFeatures,
    ) -> AnomalyDetectionResult:
        raw_features = (
            behavioral_features_to_raw_features(
                features
            )
        )

        transformed = (
            self._artifact
            .preprocessor
            .transform(
                raw_features
            )
        )

        if transformed.shape[0] != 1:
            raise ValueError(
                "Online inference requires "
                "exactly one feature row."
            )

        score = float(
            self._artifact
            .model
            .score_samples(
                transformed
            )[0]
        )

        if not np.isfinite(score):
            raise ValueError(
                "Model produced a non-finite "
                "anomaly score."
            )

        is_anomaly = (
            score
            < self._artifact.threshold
        )

        classification: Literal[
            "normal",
            "anomaly",
        ] = (
            "anomaly"
            if is_anomaly
            else "normal"
        )

        return AnomalyDetectionResult(
            classification=classification,
            is_anomaly=is_anomaly,
            score=score,
            threshold=self._artifact.threshold,
        )