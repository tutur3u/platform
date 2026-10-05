part of 'cache_store.dart';

/// Test-only abrupt termination signal: leave durable recovery state untouched.
@visibleForTesting
class CachePersistenceInterruption implements Exception {
  const CachePersistenceInterruption();
}

extension CacheStoreJournal on CacheStore {
  bool _matchesClear(Map<dynamic, dynamic> row, Map<dynamic, dynamic> scope) =>
      (scope['userId'] == null || row['userId'] == scope['userId']) &&
      (scope['workspaceId'] == null ||
          row['workspaceId'] == scope['workspaceId']) &&
      (scope['namespace'] == null || row['namespace'] == scope['namespace']);

  Future<String> _beginResourceJournal(Iterable<CacheKey> keys) async {
    final entries = <Map<String, dynamic>>[];
    for (final key in keys) {
      final index = _entityBox.get(_replicaSourceKey(key.value));
      entries.add({
        'sourceKey': key.value,
        'userId': key.userId,
        'workspaceId': key.workspaceId,
        'namespace': key.namespace,
        'previousResource': _resourceBox.get(key.value),
        'previousIndex': index,
        'previousRows': {
          for (final id in (index as List?)?.whereType<String>() ?? <String>[])
            id: _entityBox.get(id),
        },
      });
    }
    final journalKey = '@publication:${++_journalSequence}';
    await _entityBox.put(journalKey, {
      'kind': 'resource-publication',
      'entries': entries,
    });
    _resourceJournalCount++;
    await _entityBox.flush();
    return journalKey;
  }

  Future<String> _beginResourceDeletion(Iterable<CacheKey> keys) async {
    final journalKey = '@deletion:${++_journalSequence}';
    await _entityBox.put(journalKey, {
      'kind': 'resource-deletion',
      'entries': [
        for (final key in keys)
          {
            'sourceKey': key.value,
            'userId': key.userId,
            'workspaceId': key.workspaceId,
            'namespace': key.namespace,
          },
      ],
    });
    _resourceJournalCount++;
    await _entityBox.flush();
    return journalKey;
  }

  Future<void> _restoreResourceJournal(
    String journalKey, {
    required bool Function(Map<dynamic, dynamic>) restore,
  }) async {
    final journal = _entityBox.get(journalKey);
    if (journal is! Map || journal['entries'] is! List) return;
    final rowsBySource = <String, Set<String>>{};
    for (final key in _entityBox.keys.whereType<String>()) {
      final row = _entityBox.get(key);
      if (row is Map && row['sourceKey'] is String) {
        (rowsBySource[row['sourceKey'] as String] ??= {}).add(key);
      }
    }
    final deleting = journal['kind'] == 'resource-deletion';
    for (final entry
        in (journal['entries'] as List).whereType<Map<dynamic, dynamic>>()) {
      final sourceKey = entry['sourceKey'] as String;
      final indexKey = _replicaSourceKey(sourceKey);
      final current = _entityBox.get(indexKey);
      final oldRows = Map<String, dynamic>.from(
        entry['previousRows'] as Map? ?? const {},
      );
      // Include attempt rows left before the source index was published.
      final attemptKeys = rowsBySource[sourceKey] ?? const <String>{};
      await _entityBox.deleteAll({
        ...attemptKeys,
        ...oldRows.keys,
        ...(current as List?)?.whereType<String>() ?? <String>[],
      });
      if (!deleting && restore(entry)) {
        final resource = entry['previousResource'];
        if (resource is Map) {
          await _resourceBox.put(sourceKey, resource);
          if (_initialized) _putRecord(CachedResourceRecord.fromJson(resource));
        } else {
          await _resourceBox.delete(sourceKey);
          if (_initialized) _dropRecord(sourceKey);
        }
        await _entityBox.putAll(oldRows);
        if (entry['previousIndex'] != null) {
          await _entityBox.put(indexKey, entry['previousIndex']);
        } else {
          await _entityBox.delete(indexKey);
        }
      } else {
        await _resourceBox.delete(sourceKey);
        await _entityBox.delete(indexKey);
        if (_initialized) _dropRecord(sourceKey);
      }
    }
    _entityBytes = _countReplicaBytes();
    await _finishResourceJournal(journalKey);
  }

  Future<void> _finishResourceJournal(
    String key, {
    bool mutationsChanged = false,
  }) async {
    final exists = _entityBox.containsKey(key);
    // Durable state precedes durable removal of the recovery marker.
    await _resourceBox.flush();
    if (mutationsChanged) await _mutationBox.flush();
    // Entity operations are ordered in one box log: its prior row/index writes
    // precede this marker deletion. Flush that ordered batch once, after the
    // other affected boxes are durable; never flush the marker ahead of them.
    await _entityBox.delete(key);
    await _entityBox.flush();
    if (exists && _resourceJournalCount > 0) _resourceJournalCount--;
  }

  Future<void> _applyClearIntent(Map<dynamic, dynamic> intent) async {
    if (_initialized) {
      for (final record in _memory.values.toList(growable: false)) {
        if (_matchesClear(record.toJson(), intent)) _dropRecord(record.key);
      }
    }
    final sourceKeys = <String>{};
    for (final key in _resourceBox.keys.toList()) {
      final raw = _resourceBox.get(key);
      if (raw is Map && _matchesClear(raw, intent)) {
        sourceKeys.add(key.toString());
        await _resourceBox.delete(key);
      }
    }
    for (final key in _entityBox.keys.toList()) {
      final raw = _entityBox.get(key);
      if (raw is Map && raw['payload'] != null && _matchesClear(raw, intent)) {
        sourceKeys.add(raw['sourceKey'] as String);
        await _entityBox.delete(key);
      }
    }
    for (final key in sourceKeys) {
      await _entityBox.delete(_replicaSourceKey(key));
    }
    if (intent['namespace'] != null || intent['resourceOnly'] == true) return;
    for (final key in _mutationBox.keys.toList()) {
      final raw = _mutationBox.get(key);
      if (raw is Map && _matchesClear(raw, intent)) {
        await _mutationBox.delete(key);
      }
    }
    await _clearReplicaMappingsScope(
      intent['userId'] as String?,
      intent['workspaceId'] as String?,
    );
  }

  // Run before exposing either snapshot memory or replica queries. Clear intent
  // takes precedence over unfinished publication after restart.
  Future<void> _recoverResourceJournals() async {
    final intents = <String, Map<dynamic, dynamic>>{};
    final journals = <String>[];
    for (final key in _entityBox.keys.whereType<String>().toList()) {
      final raw = _entityBox.get(key);
      if (raw is! Map) continue;
      if (raw['kind'] == 'resource-clear') intents[key] = raw;
      if (raw['kind'] == 'resource-publication' ||
          raw['kind'] == 'resource-deletion') {
        journals.add(key);
      }
    }
    _resourceJournalCount = journals.length + intents.length;
    if (_resourceJournalCount == 0) return;
    for (final key in journals) {
      await _restoreResourceJournal(
        key,
        restore: (entry) =>
            !intents.values.any((intent) => _matchesClear(entry, intent)),
      );
    }
    for (final entry in intents.entries) {
      await _applyClearIntent(entry.value);
      await _finishResourceJournal(
        entry.key,
        mutationsChanged:
            entry.value['namespace'] == null &&
            entry.value['resourceOnly'] != true,
      );
    }
    _entityBytes = _countReplicaBytes();
  }
}
