part of 'api_client.dart';

extension _ApiClientVerification on ApiClient {
  /// One Turnstile token for a server step-up on [response].
  ///
  /// Writes and explicit offline downloads may show the interactive check;
  /// a plain read (Home, lists, navigation) only gets the background solve,
  /// so it can never open UI over the page. Without a token the step-up
  /// response stands and the caller shows its usual error state. Read entry
  /// points pass [read] themselves: an injected client may not report the
  /// request method on its response.
  Future<String?> _verificationToken(
    http.BaseResponse response, {
    required bool read,
    ValueNotifier<bool>? cancellation,
  }) async {
    try {
      return await ApiVerification.request(
        cancellation: cancellation,
        allowPrompt: ApiVerification.promptsFor(
          read ? 'GET' : response.request?.method,
          bulkRead: OfflineApiRequest.active,
        ),
      );
    } on Object {
      throw const ApiException(
        message: 'Unable to verify request',
        statusCode: 0,
        failureKind: ApiFailureKind.session,
      );
    }
  }
}
