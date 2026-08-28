import os
from dataclasses import dataclass
from pathlib import Path

import joblib
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest


DEFAULT_MODEL_ARTIFACT_PATH = (
    "data/model/isolation_forest.joblib"
)


@dataclass(frozen=True, slots=True)
class ModelArtifact:
    preprocessor: ColumnTransformer
    model: IsolationForest
    threshold: float
    target_fpr: float


def get_model_artifact_path() -> Path:
    return Path(
        os.getenv(
            "MODEL_ARTIFACT_PATH",
            DEFAULT_MODEL_ARTIFACT_PATH,
        )
    )


def save_model_artifact(
    artifact: ModelArtifact,
) -> Path:
    artifact_path = get_model_artifact_path()

    artifact_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        artifact,
        artifact_path,
    )

    return artifact_path


def load_model_artifact() -> ModelArtifact:
    artifact_path = get_model_artifact_path()

    if not artifact_path.exists():
        raise FileNotFoundError(
            "Model artifact not found: "
            f"{artifact_path}"
        )

    artifact = joblib.load(
        artifact_path
    )

    if not isinstance(
        artifact,
        ModelArtifact,
    ):
        raise TypeError(
            "Invalid model artifact."
        )

    return artifact