import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:path_provider/path_provider.dart';

typedef CacheJsonDecoder<T> = T Function(Object? json);

class CacheStore {
  CacheStore._();

  static final CacheStore instance = CacheStore._();

  static const _resourceBoxName = 'offline_cache_v1';
  static const _mutationBoxName = 'offline_mutations_v1';

  final Map<String, CachedResourceRecord> _memory = {};
  late Box<dynamic> _resourceBox;
  late Box<dynamic> _mutationBox;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    WidgetsFlutterBinding.ensureInitialized();
    Directory dir;
    try {
      dir = await getApplicationDocumentsDirectory();
    } on MissingPluginException {
      dir = await Directory.systemTemp.createTemp('mobile-cache-');
    }
    Hive.init(dir.path);
    _resourceBox = await Hive.openBox<dynamic>(_resourceBoxName);
    _mutationBox = await Hive.openBox<dynamic>(_mutationBoxName);
    for (final key in _resourceBox.keys) {
      final raw = _resourceBox.get(key);
      if (raw is Map<dynamic, dynamic>) {
        final record = CachedResourceRecord.fromJson(raw);
        _memory[record.key] = record;
      }
    }
    _initialized = true;
  }

  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async {
    await init();
    final record = _memory[key.value];
    if (record == null) {
      return CacheReadResult<T>(
        state: CacheEntryState.missing,
      );
    }

    final decoded = decode(jsonDecode(record.jsonPayload));
    return CacheReadResult<T>(
      state: record.state,
      data: decoded,
      fetchedAt: record.fetchedAt,
      isFromCache: true,
      hasValue: true,
    );
  }

  CacheReadResult<T> peek<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) {
    if (!_initialized) {
      return CacheReadResult<T>(
        state: CacheEntryState.missing,
      );
    }

    final record = _memory[key.value];
    if (record == null) {
      return CacheReadResult<T>(
        state: CacheEntryState.missing,
      );
    }

    final decoded = decode(jsonDecode(record.jsonPayload));
    return CacheReadResult<T>(
      state: record.state,
      data: decoded,
      fetchedAt: record.fetchedAt,
      isFromCache: true,
      hasValue: true,
    );
  }

  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const <String>[],
  }) async {
    await init();
    final now = DateTime.now();
    final record = CachedResourceRecord(
      key: key.value,
      namespace: key.namespace,
      jsonPayload: jsonEncode(payload),
      fetchedAt: now,
      staleAt: now.add(policy.staleAfter),
      expireAt: now.add(policy.expireAfter),
      userId: key.userId,
      workspaceId: key.workspaceId,
      locale: key.locale,
      schemaVersion: key.schemaVersion,
      etag: etag,
      tags: tags,
      params: key.params,
    );
    _memory[key.value] = record;
    await _resourceBox.put(key.value, record.toJson());
  }

  Future<void> remove(CacheKey key) async {
    await init();
    _memory.remove(key.value);
    await _resourceBox.delete(key.value);
  }

  Future<void> invalidateTags(
    Iterable<String> tags, {
    String? workspaceId,
    String? userId,
  }) async {
    await init();
    final tagSet = tags.toSet();
    final keysToDelete = <String>[];

    for (final entry in _memory.entries) {
      final record = entry.value;
      final matchesTags = record.tags.any(tagSet.contains);
      final matchesWorkspace =
          workspaceId == null || record.workspaceId == workspaceId;
      final matchesUser = userId == null || record.userId == userId;
      if (matchesTags && matchesWorkspace && matchesUser) {
        keysToDelete.add(entry.key);
      }
    }

    for (final key in keysToDelete) {
      _memory.remove(key);
      await _resourceBox.delete(key);
    }
  }

  Future<void> clearScope({
    String? userId,
    String? workspaceId,
  }) async {
    await init();
    final keysToDelete = <String>[];
    for (final entry in _memory.entries) {
      final record = entry.value;
      final matchesUser = userId == null || record.userId == userId;
      final matchesWorkspace =
          workspaceId == null || record.workspaceId == workspaceId;
      if (matchesUser && matchesWorkspace) {
        keysToDelete.add(entry.key);
      }
    }

    for (final key in keysToDelete) {
      _memory.remove(key);
      await _resourceBox.delete(key);
    }

    final mutationIds = <dynamic>[];
    for (final dynamic key in _mutationBox.keys) {
      final raw = _mutationBox.get(key);
      if (raw is! Map<dynamic, dynamic>) continue;
      final record = PendingMutationRecord.fromJson(raw);
      final matchesUser = userId == null || record.userId == userId;
      final matchesWorkspace =
          workspaceId == null || record.workspaceId == workspaceId;
      if (matchesUser && matchesWorkspace) {
        mutationIds.add(key);
      }
    }
    for (final id in mutationIds) {
      await _mutationBox.delete(id);
    }
  }

  Future<void> savePendingMutation(PendingMutationRecord record) async {
    await init();
    await _mutationBox.put(record.id, record.toJson());
  }

  Future<void> deletePendingMutation(String id) async {
    await init();
    await _mutationBox.delete(id);
  }

  Future<List<PendingMutationRecord>> listPendingMutations() async {
    await init();
    final records = <PendingMutationRecord>[];
    for (final key in _mutationBox.keys) {
      final raw = _mutationBox.get(key);
      if (raw is Map<dynamic, dynamic>) {
        records.add(PendingMutationRecord.fromJson(raw));
      }
    }
    records.sort((left, right) => left.createdAt.compareTo(right.createdAt));
    return records;
  }

  Future<CacheReadResult<T>> prefetch<T>({
    required CacheKey key,
    required CachePolicy policy,
    required CacheJsonDecoder<T> decode,
    required Future<Object?> Function() fetch,
    bool forceRefresh = false,
    List<String> tags = const <String>[],
  }) async {
    final cached = await read<T>(key: key, decode: decode);
    final shouldFetch = forceRefresh || !cached.hasValue || !cached.isFresh;
    if (!shouldFetch) {
      return cached;
    }

    if (cached.hasValue && !forceRefresh && policy.allowBackgroundRefresh) {
      unawaited(
        fetch()
            .then((payload) {
              return write(
                key: key,
                policy: policy,
                payload: payload,
                tags: tags,
              );
            })
            .catchError((_) {}),
      );
      return cached;
    }

    final payload = await fetch();
    await write(
      key: key,
      policy: policy,
      payload: payload,
      tags: tags,
    );

    return CacheReadResult<T>(
      state: CacheEntryState.fresh,
      data: decode(payload),
      fetchedAt: DateTime.now(),
      hasValue: true,
    );
  }
}
