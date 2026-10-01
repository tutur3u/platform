part of 'inventory_season_pricing_controller.dart';

extension _SeasonRecovery on InventorySeasonPricingController {
  void _adopt(InventorySaleOperation record) {
    operation = record;
    completedInvoiceId = record.invoiceId;
    _pending = record.invoiceId == null ? record.payload : null;
    currency = record.currency;
    if (period?.id != record.payload['inventory_period_id']) {
      period = InventorySalesPeriod(
        id: record.payload['inventory_period_id'] as String,
        name: record.periodName,
        status: 'active',
        saleCount: 0,
        pricingMode: 'scheduled',
        timeZone: record.timeZone,
      );
    }
  }

  Future<void> _restoreOperation(
    int token,
    String? actor,
    String? workspace,
  ) async {
    if (actor == null || workspace == null) return;
    try {
      final record = await journal.locked(
        actor,
        workspace,
        () => journal.read(actor, workspace),
      );
      if (token != _generation || _disposed) return;
      if (record != null) _adopt(record);
      journalFailed = false;
    } on Object {
      if (token == _generation && !_disposed) journalFailed = true;
    } finally {
      if (token == _generation && !_disposed) {
        restoring = false;
        _notify();
      }
    }
  }

  bool _owns(int token, String actor) =>
      !_disposed &&
      token == _generation &&
      (currentActor == null || currentActor!() == actor);

  Future<String> _attemptOperation(int token) async {
    final actor = _actor!;
    final workspace = _workspace!;
    final body = jsonEncode(_pending);
    sending = true;
    _notify();
    try {
      return await journal.locked(actor, workspace, () async {
        if (!_owns(token, actor)) throw StateError('Scope changed');
        InventorySaleOperation? existing;
        try {
          existing = await journal.read(actor, workspace);
        } on Object {
          if (_owns(token, actor)) journalFailed = true;
          rethrow;
        }
        if (!_owns(token, actor)) throw StateError('Scope changed');
        InventorySaleOperation record;
        if (existing != null) {
          _adopt(existing);
          _notify();
          if (existing.invoiceId != null) return existing.invoiceId!;
          // Another checkout prepared an operation; first open its recovery UI.
          if (existing.body != body) {
            throw StateError('Existing operation requires recovery');
          }
          record = existing;
        } else {
          if (operation != null) {
            throw StateError('Operation journal disappeared');
          }
          record = InventorySaleOperation(
            actor: actor,
            workspace: workspace,
            requestId: _pending!['inventory_request_id'] as String,
            body: body,
            currency: currency,
            periodName: period!.name,
            timeZone: period!.timeZone!,
            asOf: quote!.asOf,
            createdAt: now().toUtc(),
            labels: _draftLabels,
          );
          // Failure retains the in-memory key and blocks any
          // subsequent new key.
          operation = record;
          try {
            await journal.write(record);
          } on Object {
            if (_owns(token, actor)) journalFailed = true;
            rethrow;
          }
        }
        if (!_owns(token, actor)) throw StateError('Scope changed');
        if (existing != null) {
          final lookup = lookupReceipt;
          if (lookup == null) {
            throw StateError('Authenticated reconciliation unavailable');
          }
          final committed = await lookup(workspace, record.requestId);
          if (!_owns(token, actor)) throw StateError('Scope changed');
          if (committed != null) {
            return await _confirmOperation(record, committed, token);
          }
          // Not observed is not absence proof. Only this explicit user action
          // resends the same durable UUID/body; every rejection retains it.
        }
        if (!_owns(token, actor)) throw StateError('Scope changed');
        final id = await send(workspace, record.payload);
        // Always record the owning operation even if its observer detached.
        return await _confirmOperation(record, id, token);
      });
    } on Object {
      // Storage errors and all HTTP statuses preserve the unresolved identity.
      rethrow;
    } finally {
      if (token == _generation && !_disposed) {
        sending = false;
        _notify();
      }
    }
  }

  Future<String> _confirmOperation(
    InventorySaleOperation record,
    String id,
    int token,
  ) async {
    if (id.isEmpty) throw const FormatException('Missing invoice receipt');
    final confirmed = record.confirmed(id);
    if (token == _generation && !_disposed) {
      completedInvoiceId = id;
      _pending = null;
      operation = confirmed;
      _notify();
    }
    try {
      await journal.write(confirmed);
    } on Object {
      // Known invoice success stays terminal. The original durable prepared
      // record will require receipt reconciliation on the next entry.
      if (token == _generation && !_disposed) journalFailed = true;
    }
    return id;
  }
}
