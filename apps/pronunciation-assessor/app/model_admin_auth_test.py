import unittest

from model_admin_auth import verify_model_admin_authorization


class ModelAdminAuthorizationTest(unittest.TestCase):
    def test_model_control_is_disabled_when_no_token_is_configured(self) -> None:
        failure = verify_model_admin_authorization(
            "Bearer attacker-token",
            "",
        )

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 404)

    def test_model_control_requires_bearer_authorization(self) -> None:
        failure = verify_model_admin_authorization(None, "operator-token")

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 401)

    def test_model_control_rejects_invalid_bearer_token(self) -> None:
        failure = verify_model_admin_authorization(
            "Bearer attacker-token",
            "operator-token",
        )

        self.assertIsNotNone(failure)
        self.assertEqual(failure.status_code, 403)

    def test_model_control_accepts_matching_bearer_token(self) -> None:
        failure = verify_model_admin_authorization(
            "Bearer operator-token",
            "operator-token",
        )

        self.assertIsNone(failure)


if __name__ == "__main__":
    unittest.main()
