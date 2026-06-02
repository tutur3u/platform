import math
from dataclasses import dataclass


@dataclass(frozen=True)
class AudioLimitFailure:
    detail: str
    status_code: int


def validate_audio_duration_seconds(
    duration_seconds: float, max_duration_seconds: float
) -> AudioLimitFailure | None:
    if not math.isfinite(duration_seconds) or duration_seconds < 0:
        return AudioLimitFailure(
            detail="Could not inspect audio duration",
            status_code=400,
        )

    if duration_seconds > max_duration_seconds:
        return AudioLimitFailure(
            detail=(
                "Audio duration exceeds "
                f"{int(max_duration_seconds)} second pronunciation limit"
            ),
            status_code=413,
        )

    return None


def validate_audio_upload_bytes(
    byte_count: int, max_upload_bytes: int
) -> AudioLimitFailure | None:
    if byte_count > max_upload_bytes:
        return AudioLimitFailure(
            detail="Audio file must be 10 MB or smaller",
            status_code=413,
        )

    return None
