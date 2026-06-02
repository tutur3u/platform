import hmac
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelAdminAuthFailure:
    detail: str
    status_code: int


def verify_model_admin_authorization(
    authorization: str | None, configured_token: str | None
) -> ModelAdminAuthFailure | None:
    token = (configured_token or "").strip()
    if not token:
        return ModelAdminAuthFailure(
            detail="Model control is disabled",
            status_code=404,
        )

    if not authorization:
        return ModelAdminAuthFailure(
            detail="Model control authorization is required",
            status_code=401,
        )

    scheme, separator, credential = authorization.strip().partition(" ")
    if scheme.lower() != "bearer" or not separator or not credential.strip():
        return ModelAdminAuthFailure(
            detail="Model control authorization is required",
            status_code=401,
        )

    if not hmac.compare_digest(credential.strip(), token):
        return ModelAdminAuthFailure(
            detail="Invalid model control authorization",
            status_code=403,
        )

    return None
