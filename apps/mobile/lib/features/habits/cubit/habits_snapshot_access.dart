import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/scoped_cache_access.dart';
import 'package:mobile/data/sources/api_client.dart';

bool habitsAccessDenied(Object error) =>
    error is ApiException &&
    !error.isVerificationRequired &&
    error.code != 'MFA_REQUIRED' &&
    (error.statusCode == 401 || error.statusCode == 403);

class HabitsSnapshotDenial {
  const HabitsSnapshotDenial(this.key, this.error);
  final CacheKey key;
  final ApiException error;
}

/// Every query variant shares its actor/workspace revocation marker. Only a
/// fresh authorized list durably published can remove that marker.
class HabitsSnapshotAccess {
  HabitsSnapshotAccess(this.store, {FlutterSecureStorage? storage})
    : _access = ScopedCacheAccess(
        storage ?? const FlutterSecureStorage(),
        markerPrefix: 'habits-workspace-denied-v1',
      );

  factory HabitsSnapshotAccess.shared(CacheStore store) =>
      _instances[store] ??= HabitsSnapshotAccess(store);

  static final _instances = Expando<HabitsSnapshotAccess>();

  final CacheStore store;
  final ScopedCacheAccess _access;
  final _revisions = <String, int>{};
  final _writes = <String, Future<void>>{};
  final denial = ValueNotifier<HabitsSnapshotDenial?>(null);

  CacheKey _markerKey(CacheKey key) => CacheKey(
    namespace: 'habits.workspace.access',
    userId: key.userId,
    workspaceId: key.workspaceId,
  );

  int revision(CacheKey key) => _revisions[_markerKey(key).value] ?? 0;
  bool canPeek(CacheKey key) => _access.canPeek(_markerKey(key));
  Future<bool> canRead(CacheKey key) async {
    try {
      return await _access.canRead(_markerKey(key));
    } on Object {
      // An unreadable revocation marker does not authorize a private snapshot.
      return false;
    }
  }

  void checkRevision(CacheKey key, int expected) {
    if (revision(key) != expected) {
      throw const ApiException(
        message: 'Habits access changed during the request',
        statusCode: 0,
        failureKind: ApiFailureKind.session,
      );
    }
  }

  Future<T> _serialize<T>(CacheKey key, Future<T> Function() action) async {
    final id = _markerKey(key).value;
    final previous = _writes[id] ?? Future<void>.value();
    final done = Completer<void>();
    _writes[id] = done.future;
    await previous;
    try {
      return await action();
    } finally {
      done.complete();
      if (identical(_writes[id], done.future)) {
        unawaited(_writes.remove(id));
      }
    }
  }

  Future<void> revoke(
    CacheKey key,
    ApiException error,
    void Function() checkScope,
  ) async {
    checkScope();
    final marker = _markerKey(key);
    _revisions[marker.value] = revision(key) + 1;
    _access.block(marker);
    denial.value = HabitsSnapshotDenial(key, error);
    // After admission, finish recording this authenticated denial even if the
    // screen departs. New authorized publications wait behind this purge.
    await _serialize(key, () async {
      Object? markerFailure;
      try {
        await _access.persistDenial(marker);
      } on Object catch (failure) {
        markerFailure = failure;
      }
      // Null means wildcard to CacheStore; an anonymous failure must never
      // erase another account's authenticated snapshots.
      if (key.userId == null || key.workspaceId == null) return;
      try {
        await store.clearScope(
          namespace: 'habits.workspace',
          userId: key.userId,
          workspaceId: key.workspaceId,
          resourceOnly: true,
        );
      } on Object {
        if (markerFailure != null) {
          throw ApiException(
            message:
                'Habits access was revoked but storage could not erase it.',
            statusCode: error.statusCode,
            code: 'HABITS_CACHE_REVOCATION_FAILED',
          );
        }
        // A durable marker prevents reopening the retained snapshot.
      }
    });
  }

  Future<void> publish({
    required CacheKey key,
    required Object payload,
    required CachePolicy policy,
    required List<String> tags,
    required int expectedRevision,
    required void Function() checkScope,
    bool authorizedList = false,
  }) => _serialize(key, () async {
    void guard() {
      checkScope();
      checkRevision(key, expectedRevision);
    }

    guard();
    if (!authorizedList && !canPeek(key)) return;
    await store.write(
      key: key,
      payload: payload,
      policy: policy,
      tags: tags,
      checkScope: guard,
      requirePublication: authorizedList,
    );
    guard();
    if (authorizedList) await _access.allow(_markerKey(key), guard);
  });
}
