import 'package:mobile/data/sources/api_client.dart';

/// Why a collaboration request failed, so the screen can say what to do.
enum CollabFailure {
  /// No connection: the request never reached the server.
  offline,

  /// The server refused the caller (401 or 403).
  forbidden,

  /// The task, comment, link or share is gone (404).
  notFound,

  /// The request was rejected as invalid (400, 409 or 422).
  invalid,
  other,
}

CollabFailure collabFailureOf(Object error) {
  if (error is! ApiException) return CollabFailure.other;
  if (error.failureKind == ApiFailureKind.transport || error.statusCode == 0) {
    return CollabFailure.offline;
  }
  return switch (error.statusCode) {
    401 || 403 => CollabFailure.forbidden,
    404 => CollabFailure.notFound,
    400 || 409 || 422 => CollabFailure.invalid,
    _ => CollabFailure.other,
  };
}

/// The status of a section's first load.
enum CollabLoad { loading, loaded, failed }

/// Runs [action], reporting its failure instead of throwing.
Future<CollabFailure?> attemptCollab(Future<void> Function() action) async {
  try {
    await action();
    return null;
  } on Object catch (error) {
    return collabFailureOf(error);
  }
}
