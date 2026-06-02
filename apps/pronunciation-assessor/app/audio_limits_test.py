import unittest

from audio_limits import (
    validate_audio_duration_seconds,
    validate_audio_upload_bytes,
)


class AudioLimitsTest(unittest.TestCase):
    def test_rejects_invalid_audio_duration(self) -> None:
        failure = validate_audio_duration_seconds(float("nan"), 120)

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 400)

    def test_rejects_audio_duration_over_limit(self) -> None:
        failure = validate_audio_duration_seconds(121, 120)

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 413)

    def test_accepts_audio_duration_at_limit(self) -> None:
        failure = validate_audio_duration_seconds(120, 120)

        self.assertIsNone(failure)

    def test_rejects_upload_bytes_over_limit(self) -> None:
        failure = validate_audio_upload_bytes(
            10 * 1024 * 1024 + 1,
            10 * 1024 * 1024,
        )

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 413)

    def test_accepts_upload_bytes_at_limit(self) -> None:
        failure = validate_audio_upload_bytes(10 * 1024 * 1024, 10 * 1024 * 1024)

        self.assertIsNone(failure)


if __name__ == "__main__":
    unittest.main()
