import 'package:flutter/foundation.dart';

enum OfflinePreparationStatus {
  queued,
  waitingRetry,
  waitingWifi,
  downloading,
  ready,
  failed,
  unavailable,
}

class OfflinePreparationUnavailable implements Exception {
  const OfflinePreparationUnavailable();
}

@immutable
class OfflineProductPreparation {
  const OfflineProductPreparation({
    this.status = OfflinePreparationStatus.queued,
    this.lastSuccess,
    this.errorMessage,
    this.retryAt,
  });
  final OfflinePreparationStatus status;
  final DateTime? lastSuccess;
  final String? errorMessage;
  final DateTime? retryAt;
}

@immutable
class OfflinePreparationState {
  const OfflinePreparationState({
    this.userId,
    this.workspaceId,
    this.running = false,
    this.products = const {},
    this.retryAt,
    this.retryExhausted = false,
  });
  final String? userId;
  final String? workspaceId;
  final bool running;
  final DateTime? retryAt;
  final bool retryExhausted;
  final Map<String, OfflineProductPreparation> products;
  int get completed => products.values
      .where((product) => product.status == OfflinePreparationStatus.ready)
      .length;
}
