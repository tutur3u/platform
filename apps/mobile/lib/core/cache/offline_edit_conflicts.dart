part of 'offline_mutation_queue.dart';

bool _editFeature(PendingMutationRecord record) =>
    OfflineEditFlags.enabled(record.feature) &&
    {'POST', 'PUT', 'PATCH', 'DELETE'}.contains(record.method) &&
    OfflineInventoryMutation.fromRecord(record) == null;

bool _deleting(PendingMutationRecord record) =>
    record.method == 'DELETE' || record.payload?['deleted'] == true;

extension OfflineEditConflicts on OfflineMutationQueue {
  Future<PendingMutationRecord> _captureEditBase(
    PendingMutationRecord record,
  ) async {
    if (!_editFeature(record) || record.method == 'POST') return record;
    final rows = await queryLocalRows(
      store: _store,
      userId: record.userId,
      workspaceId: record.workspaceId!,
      namespaces: switch (record.feature) {
        'tasks' => ['tasks.boardTasks', 'tasks.detail', 'tasks.deletedTasks'],
        'calendar' => [
          'calendar.events',
          'calendar.events.utc.v2',
          'calendar.event.detail',
        ],
        _ => [
          'finance.transactions',
          'finance.infiniteTransactions',
          'finance.transactionDetail',
        ],
      },
    );
    final base = rows.where((row) => row['id'] == record.entityId).firstOrNull;
    return PendingMutationRecord.fromJson({
      ...record.toJson(),
      'optimisticPatch': {
        ...?record.optimisticPatch,
        if (base != null) 'base': base,
      },
    });
  }

  Future<bool> _prepareEditReplay(
    PendingMutationRecord record,
    ApiClient api,
  ) async {
    if (!_editFeature(record)) return false;
    final current = (await _store.listPendingMutations())
        .where((item) => item.id == record.id)
        .firstOrNull;
    if (current?.acknowledgedWrite == true) return true;
    if (record.attemptCount > 0 && !record.replaySafe) {
      throw const ApiException(
        message: 'Previous write needs review',
        statusCode: 409,
      );
    }
    final base = record.optimisticPatch?['base'] as Map?;
    if (record.method != 'POST' && base != null) {
      final ids = await _store.localIdMappingsForScope(
        userId: record.userId!,
        workspaceId: record.workspaceId!,
      );
      final resolved = reconcileOfflineIds(record.path, record.payload, ids);
      final response = await api.getJson(resolved.path);
      final server = (response['task'] ?? response['event'] ?? response) as Map;
      final updated = DateTime.tryParse(server['updated_at']?.toString() ?? '');
      final original = DateTime.tryParse(base['updated_at']?.toString() ?? '');
      if (server['deleted'] == true ||
          (updated != null && original != null && updated.isAfter(original)) ||
          (base['version'] != null && server['version'] != base['version'])) {
        throw const ApiException(
          message: 'Server changed since offline edit',
          statusCode: 409,
        );
      }
    }
    // No universal server idempotency contract exists. Persist a send fence
    // before dispatch: an uncertain result cannot automatically write twice.
    if (!record.replaySafe) {
      if (record.attemptCount > 0) {
        throw const ApiException(
          message: 'Previous write needs review',
          statusCode: 409,
        );
      }
      await _store.updatePendingMutation(
        record.id,
        (item) => item.copyWith(
          status: PendingMutationStatus.conflict,
          attemptCount: item.attemptCount + 1,
        ),
      );
    }
    return false;
  }

  Future<bool> _resolveEditConflict(
    PendingMutationRecord record,
    Exception error,
  ) async {
    if (!_editFeature(record) ||
        error is! ApiException ||
        !{409, 412, 404}.contains(error.statusCode)) {
      return false;
    }
    final deleting = _deleting(record);
    final finance = record.feature == 'finance';
    final resolution = deleting
        ? 'delete'
        : finance
        ? 'draft'
        : 'copy';
    final base = record.optimisticPatch?['base'] as Map?;
    final data = <String, dynamic>{
      ...?base?.cast<String, dynamic>(),
      ...?record.payload,
    };
    final locale = WidgetsBinding.instance.platformDispatcher.locale;
    final l10n = lookupAppLocalizations(
      locale.languageCode == 'vi' ? const Locale('vi') : const Locale('en'),
    );
    final titleKey = record.feature == 'tasks' ? 'name' : 'title';
    final copyId = '${record.id}-offline-copy';
    data[titleKey] = l10n.offlineCopyTitle(data[titleKey]?.toString() ?? '');
    // A terminal local record doubles as the visible recovery artifact. It is
    // never admitted by retry(), including finance drafts and dropped deletes.
    await _store.savePendingMutation(
      PendingMutationRecord.fromJson({
        ...record.toJson(),
        'status': 'conflict',
        'conflictResolution': resolution,
        'payload': {...data, 'id': copyId, if (finance) 'needs_review': true},
        'lastError': error.statusCode == 404
            ? 'server_deleted'
            : 'server_changed',
      }),
    );
    if (!deleting && !finance) {
      await _store.savePendingMutation(
        PendingMutationRecord(
          id: copyId,
          feature: record.feature,
          method: 'POST',
          path: record.path.substring(0, record.path.lastIndexOf('/')),
          createdAt: record.createdAt,
          userId: record.userId,
          workspaceId: record.workspaceId,
          payload: data,
          optimisticPatch: {'entityId': copyId},
          status: PendingMutationStatus.conflict,
          conflictResolution: 'local_copy',
        ),
      );
    }
    await _store.invalidateTags(
      {'module:${record.feature}'},
      userId: record.userId,
      workspaceId: record.workspaceId,
    );
    return true;
  }
}
