import 'package:mobile/data/sources/api_exception.dart';

bool notesVoiceAccessDenied(
  ApiException error, {
  bool includeNotFound = true,
}) =>
    (error.statusCode == 401 ||
        error.statusCode == 403 ||
        includeNotFound && error.statusCode == 404) &&
    !error.isVerificationRequired &&
    error.code != 'MFA_REQUIRED';
