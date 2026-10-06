import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mobile/data/sources/api_exception.dart';

/// Interpret capability-upload failures without arbitrary response text.
ApiException profileUploadHttpFailure(
  http.Response response, {
  DateTime Function()? clock,
}) {
  final (code, message) = switch (response.statusCode) {
    400 => (
      'PROFILE_UPLOAD_IMAGE_INVALID',
      'Unsupported or invalid profile image',
    ),
    401 || 403 => (
      'PROFILE_UPLOAD_AUTHORIZATION',
      'Profile upload authorization is unavailable',
    ),
    409 => (
      'PROFILE_UPLOAD_CONFLICT',
      'Profile upload changed; select the image again',
    ),
    413 => (
      'PROFILE_UPLOAD_IMAGE_TOO_LARGE',
      'Profile image exceeds the size limit',
    ),
    429 => ('PROFILE_UPLOAD_LIMIT', 'Profile upload limit reached'),
    >= 500 => (
      'PROFILE_UPLOAD_UNAVAILABLE',
      'Profile upload is temporarily unavailable',
    ),
    _ => ('PROFILE_UPLOAD_FAILED', 'Profile upload failed'),
  };
  return ApiException(
    statusCode: response.statusCode,
    code: code,
    message: message,
    retryAfter: _retryAfter(
      response.headers['retry-after'],
      clock ?? DateTime.now,
    ),
  );
}

// A defensive client wait ceiling, never permission to bypass server quotas.
const int _maximumRetrySeconds = 7 * 24 * 60 * 60;

int? _retryAfter(String? header, DateTime Function() clock) {
  if (header == null) return null;
  final value = header.trim();
  final seconds = int.tryParse(value);
  if (seconds != null) {
    return seconds >= 0 ? seconds.clamp(0, _maximumRetrySeconds) : null;
  }
  // Positive delta-seconds can overflow int parsing; still bound the wait.
  if (RegExp(r'^[0-9]+$').hasMatch(value)) return _maximumRetrySeconds;
  try {
    final remaining = parseHttpDate(value).difference(clock());
    if (remaining.isNegative) return 0;
    return (remaining.inMicroseconds / Duration.microsecondsPerSecond)
        .ceil()
        .clamp(0, _maximumRetrySeconds);
  } on FormatException {
    return null;
  }
}
