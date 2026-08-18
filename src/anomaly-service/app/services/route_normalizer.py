import re


NUMERIC_SEGMENT_PATTERN = re.compile(r"^\d+$")


def normalize_route(path: str) -> str:
    if not path or path == "/":
        return "/"

    segments = path.strip("/").split("/")

    normalized_segments = [
        "{id}" if NUMERIC_SEGMENT_PATTERN.fullmatch(segment) else segment
        for segment in segments
    ]

    return "/" + "/".join(normalized_segments)