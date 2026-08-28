from collections.abc import Sequence

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder

from app.persistence.dataset_repository import DatasetRecord


RAW_FEATURE_NAMES = (
    "http_method",
    "route",
    "payload_size_bytes",
    "query_param_count",
    "inter_arrival_ms",
    "requests_last_10s",
    "distinct_routes_last_30s",
)

CATEGORICAL_FEATURE_INDICES = (
    0,
    1,
)

NUMERIC_FEATURE_INDICES = (
    2,
    3,
    4,
    5,
    6,
)

def _to_float64(
    values: np.ndarray,
) -> np.ndarray:
        return values.astype(
            np.float64,
            copy=False,
)


def records_to_raw_features(
    records: Sequence[DatasetRecord],
) -> np.ndarray:
    return np.asarray(
        [
            (
                record.http_method,
                record.route,
                record.payload_size_bytes,
                record.query_param_count,
                record.inter_arrival_ms,
                record.requests_last_10s,
                record.distinct_routes_last_30s,
            )
            for record in records
        ],
        dtype=object,
    )


def build_feature_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
                CATEGORICAL_FEATURE_INDICES,
            ),
           (
                "numeric",
                FunctionTransformer(
                    _to_float64,
                    feature_names_out="one-to-one",
                ),
                NUMERIC_FEATURE_INDICES,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )