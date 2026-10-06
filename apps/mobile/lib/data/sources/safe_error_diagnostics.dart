import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';

/// Fixed fields only: never include a server body, prompt, URL or credentials.
class SafeErrorDiagnostics {
  const SafeErrorDiagnostics._({
    required this.stage,
    required this.kind,
    this.status,
    this.retryAfter,
    this.rateLimit,
  });

  factory SafeErrorDiagnostics.capture(Object error, DiagnosticStage stage) {
    if (error is ApiException) {
      return SafeErrorDiagnostics._(
        stage: stage,
        kind: error.failureKind.name,
        status: error.statusCode,
        retryAfter: error.retryAfter,
        rateLimit: error.rateLimitDiagnostics == null
            ? null
            : ApiRateLimitDiagnostics.fromHeaders({
                'x-proxy-block-reason': error.rateLimitDiagnostics!.reason,
                'x-ratelimit-policy': error.rateLimitDiagnostics!.policy,
                'x-ratelimit-caller-class':
                    error.rateLimitDiagnostics!.callerClass,
                'x-ratelimit-window': error.rateLimitDiagnostics!.window,
              }).safeSummary,
      );
    }
    return SafeErrorDiagnostics._(
      stage: stage,
      kind: switch (error) {
        TimeoutException() => 'timeout',
        FormatException() => 'format',
        StateError() => 'state',
        _ => 'unknown',
      },
    );
  }

  const SafeErrorDiagnostics.streamFailure()
    : this._(stage: DiagnosticStage.assistantReply, kind: 'stream');

  final DiagnosticStage stage;
  final String kind;
  final int? status;
  final int? retryAfter;
  final String? rateLimit;

  String get summary => [
    'diagnostics=v1',
    'stage=${stage.name}',
    'kind=$kind',
    if (status != null) 'status=$status',
    if (retryAfter != null) 'retryAfter=$retryAfter',
    if (rateLimit != null) rateLimit!,
  ].join('; ');
}

enum DiagnosticStage {
  assistantReply,
  timezoneRead,
  timezoneWrite,
  profileUpload,
}

bool canCopyInternalDiagnostics(String? verifiedEmail) =>
    verifiedEmail?.trim().toLowerCase().endsWith('@tuturuuu.com') ?? false;
