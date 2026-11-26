import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';

/// Fixed fields only: never include a server body, prompt, URL or credentials.
const Set<String> _safeDiagnosticCodes = {
  'ACCESS_DENIED',
  'CHATGPT_CONNECTION_REQUIRED',
  'CREDITS_EXHAUSTED',
  'DAILY_LIMIT_REACHED',
  'FEATURE_NOT_ALLOWED',
  'INSUFFICIENT_CREDITS',
  'INVALID_CREDIT_SOURCE',
  'MODEL_DISABLED',
  'MODEL_NOT_ALLOWED',
  'NO_ALLOCATION',
  'NO_BALANCE',
  'PERSONAL_WORKSPACE_NOT_FOUND',
  'PLAN_REQUIRED',
  'WORKSPACE_ACCESS_DENIED',
};

String? sanitizeSafeDiagnosticCode(String? code) =>
    code != null && _safeDiagnosticCodes.contains(code) ? code : null;

class SafeErrorDiagnostics {
  const SafeErrorDiagnostics._({
    required this.stage,
    required this.kind,
    this.status,
    this.code,
    this.retryAfter,
    this.rateLimit,
  });

  factory SafeErrorDiagnostics.capture(Object error, DiagnosticStage stage) {
    if (error is ApiException) {
      return SafeErrorDiagnostics._(
        stage: stage,
        kind: error.failureKind.name,
        status: error.statusCode,
        code: sanitizeSafeDiagnosticCode(error.code),
        retryAfter: error.retryAfter,
        rateLimit: error.rateLimitDiagnostics?.safeSummary,
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

  factory SafeErrorDiagnostics.streamError({int? status, String? code}) =>
      SafeErrorDiagnostics._(
        stage: DiagnosticStage.assistantReply,
        kind: 'stream',
        status: status,
        code: sanitizeSafeDiagnosticCode(code),
      );

  final DiagnosticStage stage;
  final String kind;
  final int? status;
  final String? code;
  final int? retryAfter;
  final String? rateLimit;

  String get summary => [
    'diagnostics=v1',
    'stage=${stage.name}',
    'kind=$kind',
    if (status != null) 'status=$status',
    if (code != null) 'code=$code',
    if (retryAfter != null) 'retryAfter=$retryAfter',
    if (rateLimit != null) rateLimit!,
  ].join('; ');
}

enum DiagnosticStage {
  assistantReply,
  assistantSettings,
  timezoneRead,
  timezoneWrite,
  profileUpload,
}

bool canCopyInternalDiagnostics(String? verifiedEmail) =>
    verifiedEmail?.trim().toLowerCase().endsWith('@tuturuuu.com') ?? false;
