import 'package:mobile/data/sources/api_exception.dart';

/// Why one composer attachment could not be uploaded; each maps to its own
/// actionable message so the user knows whether retrying can help.
enum AssistantAttachmentFailure {
  tooLarge,
  unsupported,
  forbidden,
  network,
  server;

  bool get retryable => this == network || this == server;

  static AssistantAttachmentFailure fromApi(ApiException error) {
    if (error.failureKind == ApiFailureKind.transport) return network;
    final code = error.code ?? '';
    final message = error.message.toLowerCase();
    if (error.statusCode == 413 ||
        code == 'file_too_large' ||
        message.contains('too_large') ||
        message.contains('too large')) {
      return tooLarge;
    }
    if (code == 'unsupported_file_type' ||
        message.contains('unsupported') ||
        message.contains('mime')) {
      return unsupported;
    }
    if (error.statusCode == 401 ||
        error.statusCode == 403 ||
        error.statusCode == 404) {
      return forbidden;
    }
    if (error.statusCode == 0 || error.statusCode == 408) return network;
    return server;
  }
}

class AssistantAttachmentUploadException implements Exception {
  const AssistantAttachmentUploadException(this.failure, {this.statusCode});

  final AssistantAttachmentFailure failure;
  final int? statusCode;

  @override
  String toString() =>
      'AssistantAttachmentUploadException(${failure.name}, $statusCode)';
}
