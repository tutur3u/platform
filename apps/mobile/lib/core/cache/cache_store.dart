import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_replica_policy.dart';
import 'package:mobile/core/cache/cache_resource_removal.dart';
import 'package:mobile/core/cache/cache_storage_snapshot.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/offline_cache_inventory.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';
import 'package:path_provider/path_provider.dart';

part 'cache_store_refresh.dart';
part 'cache_store_revalidation.dart';
part 'cache_store_storage.dart';
part 'cache_store_publication.dart';
part 'cache_store_journal.dart';
part 'cache_store_inventory.dart';
part 'cache_store_replica.dart';
part 'cache_store_pending.dart';
part 'cache_store_scopes.dart';
part 'cache_store_reconciliation.dart';

typedef CacheJsonDecoder<T> = T Function(Object? json);
typedef CacheDirectoryResolver = Future<Directory> Function();

class CacheStore {
  CacheStore._({
    FlutterSecureStorage? secureStorage,
    CacheDirectoryResolver? directoryResolver,
  }) : persistenceCheckpoint = null,
       _secureStorage = secureStorage ?? const FlutterSecureStorage(),
       _directoryResolver = directoryResolver;

  @visibleForTesting
  CacheStore.forTesting({
    required FlutterSecureStorage secureStorage,
    required CacheDirectoryResolver directoryResolver,
    this.persistenceCheckpoint,
  }) : _secureStorage = secureStorage,
       _directoryResolver = directoryResolver;

  /// Deterministic fault/interleaving injection; never configured in production.
  @visibleForTesting
  final FutureOr<void> Function(String stage)? persistenceCheckpoint;

  Future<void>? _pendingWrite;
  Future<void>? _resourceWrite;
  int _journalSequence = 0;
  int _resourceJournalCount = 0;

  static final CacheStore instance = CacheStore._();

  /// Awaits fresh repository reads after the caller has displayed cached data.
  static Future<T> awaitRevalidation<T>(Future<T> Function() operation) =>
      _CacheRevalidationScope.run(operation);

  static bool get awaitingRevalidation => _CacheRevalidationScope.active;

  /// Publishes a cached first phase, then awaits one fresh phase when needed.
  static Future<T> readWithRevalidation<T>(
    Future<T> Function() operation, {
    required void Function(T) onSnapshot,
  }) => _CacheRevalidationScope.read(operation, onSnapshot);

  static const _resourceBoxName = 'offline_cache_v1';
  static const _mutationBoxName = 'offline_mutations_v1';
  static const _entityBoxName = 'offline_entities_v1';
  static const _encryptionKeyStorageKey = 'offline-cache-hive-key-v1';
  static const _maxBytesStorageKey = 'offline-cache-max-bytes-v1';
  static const allowedMaxBytes = <int>[
    100 * 1024 * 1024,
    250 * 1024 * 1024,
    500 * 1024 * 1024,
    1024 * 1024 * 1024,
  ];
  static const _nonPersistentResourceNamespaces = {
    'settings.workspaceSecrets.list',
  };

  final FlutterSecureStorage _secureStorage;
  final CacheDirectoryResolver? _directoryResolver;
  final Map<String, CachedResourceRecord> _memory = {};
  int _resourceBytes = 0;
  late Box<dynamic> _resourceBox;
  late Box<dynamic> _mutationBox;
  late Box<dynamic> _entityBox;
  int _entityBytes = 0;
  Future<void>? _replicaMigration;
  bool _initialized = false;
  int _maxBytes = allowedMaxBytes[1];
  Future<void>? _initialization;
  final Map<String, Future<Object?>> _inFlight = {};
  final Map<
    String,
    ({CacheKey key, CachePolicy policy, Future<void> Function() refresh})
  >
  _refreshTasks = {};
  final Map<String, ({CacheKey key, List<String> tags})> _flightScopes = {};
  final Map<String, int> _keyRevisions = {};
  int _revision = 0;
  final Map<String, Future<void>> _replicaWrites = {};
  final Map<(String?, String?, String?), int> _scopeRevisions = {};
  final Map<(String?, String?, String?), int> _clearingScopes = {};

  void _putRecord(CachedResourceRecord record) {
    final previous = _memory[record.key];
    if (previous != null) {
      _resourceBytes -= utf8.encode(previous.jsonPayload).length;
    }
    _memory[record.key] = record;
    _resourceBytes += utf8.encode(record.jsonPayload).length;
  }

  final ValueNotifier<int> resourceRemovalRevision = ValueNotifier(0);
  final ValueNotifier<CacheResourceRemoval?> removedResource = ValueNotifier(
    null,
  );

  int resourceRevisionFor(CacheKey key) => _revisionFor(key);

  void _dropRecord(String key) {
    final previous = _memory.remove(key);
    if (previous != null) {
      _resourceBytes -= utf8.encode(previous.jsonPayload).length;
      removedResource.value = CacheResourceRemoval(
        key: CacheResourceRemoval.identityForKey(previous.key),
        namespace: previous.namespace,
        userId: previous.userId,
        workspaceId: previous.workspaceId,
      );
      resourceRemovalRevision.value++;
    }
  }

  Iterable<(String?, String?, String?)> _scopes(CacheKey key) => {
    for (final user in {null, key.userId})
      for (final workspace in {null, key.workspaceId})
        for (final namespace in {null, key.namespace})
          (user, workspace, namespace),
  };

  int _revisionFor(CacheKey key) {
    var revision = _keyRevisions[key.value] ?? 0;
    for (final scope in _scopes(key)) {
      final scoped = _scopeRevisions[scope] ?? 0;
      if (scoped > revision) revision = scoped;
    }
    return revision;
  }

  bool _isClearing(CacheKey key) =>
      _scopes(key).any((scope) => (_clearingScopes[scope] ?? 0) > 0);

  void _advanceKey(String key) => _keyRevisions[key] = ++_revision;

  void _invalidateFlights(
    bool Function(CacheKey key, List<String> tags) matches,
  ) {
    for (final scope in _flightScopes.values) {
      if (matches(scope.key, scope.tags)) _advanceKey(scope.key.value);
    }
  }

  Future<void> init() {
    if (_initialized) return Future<void>.value();
    return _initialization ??= _initialize().catchError((
      Object error,
      StackTrace stack,
    ) {
      _initialization = null;
      return Future<void>.error(error, stack);
    });
  }

  Future<void> _initialize() async {
    if (_initialized) return;
    WidgetsFlutterBinding.ensureInitialized();
    final dir = await _resolveHiveDirectory();
    Hive.init(dir.path);
    final encryptionCipher = await _resolveEncryptionCipher();
    _resourceBox = await _openEncryptedBox(_resourceBoxName, encryptionCipher);
    _mutationBox = await _openEncryptedBox(_mutationBoxName, encryptionCipher);
    _entityBox = await _openEncryptedBox(_entityBoxName, encryptionCipher);
    await _recoverResourceJournals();
    _entityBytes = _countReplicaBytes();
    try {
      final storedMaxBytes = int.tryParse(
        await _secureStorage.read(key: _maxBytesStorageKey) ?? '',
      );
      if (allowedMaxBytes.contains(storedMaxBytes)) _maxBytes = storedMaxBytes!;
    } on Object {
      // Cache initialization should not depend on an optional size setting.
    }
    final keysToRemove = <dynamic>[];
    final consolidated = <String, CachedResourceRecord>{};
    for (final key in _resourceBox.keys) {
      final raw = _resourceBox.get(key);
      if (raw is! Map<dynamic, dynamic>) {
        keysToRemove.add(key);
        continue;
      }
      try {
        final record = CachedResourceRecord.fromJson(raw);
        if (_nonPersistentResourceNamespaces.contains(record.namespace)) {
          keysToRemove.add(key);
          continue;
        }
        final canonicalKey = CacheKey(
          namespace: record.namespace,
          userId: record.userId,
          workspaceId: record.workspaceId,
          locale: record.locale,
          schemaVersion: record.schemaVersion,
          params: record.params,
        ).value;
        final normalized = record.key == canonicalKey
            ? record
            : record.copyWith(key: canonicalKey);
        final previous = consolidated[canonicalKey];
        if (previous == null ||
            normalized.fetchedAt.isAfter(previous.fetchedAt)) {
          consolidated[canonicalKey] = normalized;
        }
        if (key != canonicalKey) keysToRemove.add(key);
      } on Object {
        // A damaged snapshot must not block the rest of the local replica.
        keysToRemove.add(key);
      }
    }
    for (final key in keysToRemove) {
      await _resourceBox.delete(key);
    }
    for (final entry in consolidated.entries) {
      _putRecord(entry.value);
      final persisted = _resourceBox.get(entry.key);
      if (persisted is! Map<dynamic, dynamic> ||
          (persisted['fetchedAt'] as String?) !=
              entry.value.fetchedAt.toIso8601String() ||
          persisted['key'] != entry.key) {
        await _resourceBox.put(entry.key, entry.value.toJson());
      }
    }
    _replicaMigration = _migrateReplicaFromSnapshots();
    unawaited(
      _replicaMigration!.catchError((Object error) {
        debugPrint('CacheStore: entity migration unavailable: $error');
      }),
    );
    await _pruneResourceCache();
    _initialized = true;
  }

  Future<Directory> _resolveHiveDirectory() async {
    final directoryResolver = _directoryResolver;
    if (directoryResolver != null) {
      return await directoryResolver();
    }

    // Temp storage is a bootstrap/test fallback only. It keeps startup alive
    // when path_provider is unavailable, but the OS may clear it at any time.
    Future<Directory> fallbackDirectory() async {
      debugPrint(
        'CacheStore: using temp-directory fallback; '
        'cached data may not persist.',
      );
      final suffix = _cacheDirectorySuffix();
      final directory = Directory(
        '${Directory.systemTemp.path}/tuturuuu_mobile_cache$suffix',
      );
      if (!directory.existsSync()) {
        directory.createSync(recursive: true);
      }
      return directory;
    }

    try {
      return await getApplicationDocumentsDirectory();
    } on MissingPluginException {
      debugPrint(
        'CacheStore.init path_provider missing; '
        'falling back to temp cache directory.',
      );
      return await fallbackDirectory();
    } on PlatformException catch (error) {
      debugPrint(
        'CacheStore.init path_provider unavailable during bootstrap: '
        '${error.code} ${error.message}',
      );
      await Future<void>.delayed(const Duration(milliseconds: 120));
      try {
        return await getApplicationDocumentsDirectory();
      } on MissingPluginException {
        debugPrint(
          'CacheStore.init retry still missing path_provider; '
          'using temp cache directory.',
        );
        return await fallbackDirectory();
      } on PlatformException catch (retryError) {
        debugPrint(
          'CacheStore.init retry failed: ${retryError.code} '
          '${retryError.message}; using temp cache directory.',
        );
        return await fallbackDirectory();
      }
    }
  }

  String _cacheDirectorySuffix() {
    final isFlutterTest = Platform.environment.containsKey('FLUTTER_TEST');
    if (!isFlutterTest) {
      return '';
    }

    return '_test_${identityHashCode(Isolate.current)}';
  }

  Future<HiveCipher> _resolveEncryptionCipher() async {
    final encodedKey = await _readStoredEncryptionKey();
    final key = _decodeEncryptionKey(encodedKey);
    if (key != null) {
      return HiveAesCipher(key);
    }

    final generatedKey = Hive.generateSecureKey();
    try {
      await _secureStorage.write(
        key: _encryptionKeyStorageKey,
        value: base64UrlEncode(generatedKey),
      );
    } on MissingPluginException {
      if (!Platform.environment.containsKey('FLUTTER_TEST')) {
        rethrow;
      }
    }
    return HiveAesCipher(generatedKey);
  }

  Future<String?> _readStoredEncryptionKey() async {
    try {
      return await _secureStorage.read(key: _encryptionKeyStorageKey);
    } on MissingPluginException {
      if (Platform.environment.containsKey('FLUTTER_TEST')) {
        return null;
      }
      rethrow;
    }
  }

  List<int>? _decodeEncryptionKey(String? encodedKey) {
    if (encodedKey == null || encodedKey.isEmpty) {
      return null;
    }

    try {
      final key = base64Url.decode(encodedKey);
      return key.length == 32 ? key : null;
    } on FormatException {
      return null;
    }
  }

  Future<Box<dynamic>> _openEncryptedBox(
    String boxName,
    HiveCipher encryptionCipher,
  ) async {
    try {
      return await Hive.openBox<dynamic>(
        boxName,
        encryptionCipher: encryptionCipher,
      );
    } on Object catch (error) {
      if (error is! HiveError) {
        rethrow;
      }
      debugPrint(
        'CacheStore: resetting unreadable legacy cache box $boxName: $error',
      );
      await Hive.deleteBoxFromDisk(boxName);
      return await Hive.openBox<dynamic>(
        boxName,
        encryptionCipher: encryptionCipher,
      );
    }
  }

  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async {
    await init();
    final record = _memory[key.value];
    if (record == null || _isClearing(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }

    final decoded = _decodeRecordPayload(
      record,
      decode: decode,
      onCorrupt: () async {
        await _removeCorruptRecord(record);
      },
    );
    if (decoded == null) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
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
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }

    final record = _memory[key.value];
    if (record == null || _isClearing(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }

    final decoded = _decodeRecordPayload(
      record,
      decode: decode,
      onCorrupt: () {
        unawaited(_removeCorruptRecord(record));
      },
    );
    if (decoded == null) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
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
    int? expectedRevision,
    void Function()? checkScope,
    bool requirePublication = false,
  }) async {
    checkScope?.call();
    if (_isClearing(key)) {
      if (requirePublication) throw StateError('Cache scope is clearing.');
      return;
    }
    if (expectedRevision == null) _advanceKey(key.value);
    final revision = expectedRevision ?? _revisionFor(key);
    await init();
    await _replicaMigration;
    await _serializeResources(
      () => _publishResource(
        key: key,
        policy: policy,
        payload: payload,
        etag: etag,
        tags: tags,
        expectedRevision: revision,
        checkScope: checkScope,
        requirePublication: requirePublication,
      ),
    );
  }

  Future<void> remove(CacheKey key, {void Function()? checkScope}) async {
    checkScope?.call();
    _advanceKey(key.value);
    await init();
    await _replicaMigration;
    await _serializeResources(() async {
      // Recheck after async init/admission; an obsolete actor cannot erase
      // the current scope. Once admitted, finish the serialized durable purge.
      checkScope?.call();
      _refreshTasks.remove(key.value);
      _dropRecord(key.value);
      await _resourceBox.delete(key.value);
      await persistenceCheckpoint?.call('remove-snapshot');
      await _removeReplicaSource(key.value);
    });
  }

  Future<void> invalidateTags(
    Iterable<String> tags, {
    String? workspaceId,
    String? userId,
  }) async {
    await init();
    final tagSet = tags.toSet();
    _invalidateFlights(
      (key, flightTags) =>
          (workspaceId == null || key.workspaceId == workspaceId) &&
          (userId == null || key.userId == userId) &&
          flightTags.any(tagSet.contains),
    );
    await _replicaMigration;
    await _serializeResources(() async {
      final now = DateTime.now();
      final recordsToInvalidate = <String, CachedResourceRecord>{};

      for (final entry in _memory.entries) {
        final record = entry.value;
        final matchesTags = record.tags.any(tagSet.contains);
        final matchesWorkspace =
            workspaceId == null || record.workspaceId == workspaceId;
        final matchesUser = userId == null || record.userId == userId;
        if (matchesTags && matchesWorkspace && matchesUser) {
          recordsToInvalidate[entry.key] = record;
        }
      }

      for (final entry in recordsToInvalidate.entries) {
        // Completed refresh-cycle futures also carry this revision. Mutations
        // must reject those responses even after their in-flight entry is gone.
        _advanceKey(entry.key);
        final invalidatedRecord = _markRecordStale(entry.value, now: now);
        await _resourceBox.put(entry.key, invalidatedRecord.toJson());
        _putRecord(invalidatedRecord);
      }
    });
  }

  Future<void> clearScope({
    String? userId,
    String? workspaceId,
    String? namespace,
    bool resourceOnly = false,
  }) => _clearScopeSerialized(
    userId: userId,
    workspaceId: workspaceId,
    namespace: namespace,
    resourceOnly: resourceOnly,
  );

  Future<void> clearResources({String? userId}) =>
      clearScope(userId: userId, resourceOnly: true);

  CachedResourceRecord _markRecordStale(
    CachedResourceRecord record, {
    required DateTime now,
  }) {
    return record.copyWith(
      staleAt: now.subtract(const Duration(milliseconds: 1)),
      expireAt: record.expireAt,
    );
  }

  T? _decodeRecordPayload<T>(
    CachedResourceRecord record, {
    required CacheJsonDecoder<T> decode,
    required FutureOr<void> Function() onCorrupt,
  }) {
    try {
      return decode(jsonDecode(record.jsonPayload));
    } on Object catch (error, stackTrace) {
      debugPrint(
        'CacheStore: dropping corrupt cache record ${record.key}: $error',
      );
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stackTrace,
          library: 'mobile cache',
          context: ErrorDescription(
            'while decoding cached resource ${record.key}',
          ),
        ),
      );
      Future<void> dispatchOnCorrupt() async {
        try {
          await onCorrupt();
        } on Object catch (cleanupError, cleanupStackTrace) {
          debugPrint(
            'CacheStore: failed to clean corrupt cache record '
            '${record.key}: $cleanupError',
          );
          FlutterError.reportError(
            FlutterErrorDetails(
              exception: cleanupError,
              stack: cleanupStackTrace,
              library: 'mobile cache',
              context: ErrorDescription(
                'while clearing corrupt cached resource ${record.key}',
              ),
            ),
          );
        }
      }

      unawaited(dispatchOnCorrupt());
      return null;
    }
  }
}
