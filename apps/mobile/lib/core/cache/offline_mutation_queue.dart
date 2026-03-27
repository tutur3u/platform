import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

typedef OfflineMutationDispatcher =
    Future<void> Function(
      PendingMutationRecord record,
    );

class OfflineMutationQueue {
  OfflineMutationQueue._();

  static final OfflineMutationQueue instance = OfflineMutationQueue._();

  final Map<String, OfflineMutationDispatcher> _dispatchers = {};
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isDraining = false;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    await CacheStore.instance.init();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) {
      final online = results.any((result) => result != ConnectivityResult.none);
      if (online) {
        unawaited(drain());
      }
    });
    _initialized = true;
  }

  void registerDispatcher(
    String feature,
    OfflineMutationDispatcher dispatcher,
  ) {
    _dispatchers[feature] = dispatcher;
  }

  Future<void> enqueue(PendingMutationRecord record) async {
    await init();
    await CacheStore.instance.savePendingMutation(record);
  }

  Future<void> cancel(String id) async {
    await init();
    await CacheStore.instance.deletePendingMutation(id);
  }

  Future<List<PendingMutationRecord>> listPending() async {
    await init();
    return CacheStore.instance.listPendingMutations();
  }

  Future<void> drain() async {
    if (_isDraining) return;
    _isDraining = true;
    try {
      final records = await listPending();
      for (final record in records) {
        final dispatcher = _dispatchers[record.feature];
        if (dispatcher == null) {
          continue;
        }

        try {
          await dispatcher(record);
          await CacheStore.instance.deletePendingMutation(record.id);
        } on Exception catch (error) {
          final nextRecord = record.copyWith(
            attemptCount: record.attemptCount + 1,
            lastError: error.toString(),
          );
          await CacheStore.instance.savePendingMutation(nextRecord);
          if (!_isRetryable(error)) {
            continue;
          }
          break;
        }
      }
    } finally {
      _isDraining = false;
    }
  }

  bool _isRetryable(Object error) {
    final normalized = error.toString().toLowerCase();
    return normalized.contains('socket') ||
        normalized.contains('network') ||
        normalized.contains('connection') ||
        normalized.contains('timeout');
  }

  Future<void> dispose() async {
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    _initialized = false;
  }
}
