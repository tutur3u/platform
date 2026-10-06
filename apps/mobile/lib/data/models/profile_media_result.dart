import 'dart:io';

import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';

enum ProfileMediaFailureKind {
  image,
  size,
  authorization,
  conflict,
  limited,
  unavailable,
  receipt,
  file,
  unknown,
}

enum ProfileMediaTarget { avatar, banner, removeBanner }

/// Display and copy metadata excludes arbitrary messages and capability URLs.
class ProfileMediaFailure {
  ProfileMediaFailure.capture(Object error)
    : kind = switch (error) {
        ApiException(code: 'PROFILE_UPLOAD_RECEIPT_INVALID') =>
          ProfileMediaFailureKind.receipt,
        ApiException(statusCode: 413) => ProfileMediaFailureKind.size,
        ApiException(statusCode: 400) ||
        FormatException() => ProfileMediaFailureKind.image,
        ApiException(statusCode: 401 || 403) =>
          ProfileMediaFailureKind.authorization,
        ApiException(statusCode: 409) => ProfileMediaFailureKind.conflict,
        ApiException(statusCode: 429) => ProfileMediaFailureKind.limited,
        ApiException(statusCode: >= 500) => ProfileMediaFailureKind.unavailable,
        FileSystemException() => ProfileMediaFailureKind.file,
        _ => ProfileMediaFailureKind.unknown,
      },
      diagnostics = SafeErrorDiagnostics.capture(
        error,
        DiagnosticStage.profileUpload,
      );
  final ProfileMediaFailureKind kind;
  final SafeErrorDiagnostics diagnostics;
}

/// Legacy callers can still use the original success/error record.
class ProfileMediaResult {
  const ProfileMediaResult.success()
    : success = true,
      error = null,
      failure = null;
  ProfileMediaResult.failure(Object cause)
    : success = false,
      error = cause is ApiException ? cause.message : 'Profile update failed',
      failure = ProfileMediaFailure.capture(cause);
  final bool success;
  final String? error;
  final ProfileMediaFailure? failure;
  ({bool success, String? error}) get legacy =>
      (success: success, error: error);
}
