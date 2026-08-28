from sklearn.ensemble import IsolationForest


RANDOM_STATE = 42


def build_isolation_forest() -> IsolationForest:
    return IsolationForest(
        n_estimators=100,
        max_samples="auto",
        contamination="auto",
        random_state=RANDOM_STATE,
    )