part of 'offline_mutation_queue.dart';

extension OfflineMutationFailure on OfflineMutationQueue {
  PendingMutationStatus _replayFailureStatus(
    PendingMutationRecord record,
    Exception error,
    int attemptCount,
  ) {
    return switch (error) {
      ApiException(statusCode: 409 || 412) => PendingMutationStatus.conflict,
      ApiException(statusCode: 401 || 429) => PendingMutationStatus.queued,
      ApiException(isVerificationRequired: true) =>
        PendingMutationStatus.queued,
      ApiException(statusCode: 403) => PendingMutationStatus.failed,
      _
          when record.isSingleNotificationRead &&
              _isRetryable(error) &&
              attemptCount >= 4 =>
        PendingMutationStatus.failed,
      _
          when _isRetryable(error) &&
              !record.replaySafe &&
              !record.isSingleNotificationRead =>
        PendingMutationStatus.conflict,
      _ when _isRetryable(error) => PendingMutationStatus.queued,
      _ => PendingMutationStatus.failed,
    };
  }
}
