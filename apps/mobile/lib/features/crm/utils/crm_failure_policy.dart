import 'package:mobile/data/sources/api_client.dart';

bool crmAccessDenied(ApiException error) =>
    error.statusCode == 401 ||
    (error.statusCode == 403 &&
        error.code != 'MFA_REQUIRED' &&
        !error.isVerificationRequired);

bool crmTemporaryFailure(ApiException error) =>
    error.failureKind == ApiFailureKind.transport ||
    error.statusCode == 429 ||
    error.statusCode >= 500 ||
    (error.statusCode == 403 &&
        (error.code == 'MFA_REQUIRED' || error.isVerificationRequired));
