import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';

/// Status zero also covers local, session and contract errors.
/// Only confirmed transport failures allow offline fallback.
enum ApiFailureKind { http, transport, response, session, unknown }

/// API failure with independent HTTP status and transport classification.
class ApiException implements Exception {
  const ApiException({
    required this.message,
    required this.statusCode,
    this.failureKind = ApiFailureKind.http,
    this.retryAfter,
    this.rateLimitDiagnostics,
    this.code,
    this.isVerificationRequired = false,
    this.offlineContractObserved = false,
  });

  const ApiException.transport({required this.message})
    : statusCode = 0,
      failureKind = ApiFailureKind.transport,
      retryAfter = null,
      rateLimitDiagnostics = null,
      code = null,
      isVerificationRequired = false,
      offlineContractObserved = false;

  final ApiFailureKind failureKind;
  final String message;
  final int statusCode;
  final int? retryAfter;
  final ApiRateLimitDiagnostics? rateLimitDiagnostics;
  final String? code;
  final bool isVerificationRequired;
  final bool offlineContractObserved;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
