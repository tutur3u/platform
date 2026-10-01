part of 'inventory_checkout_page.dart';

extension _InventoryCheckoutRecovery on _InventoryCheckoutPageState {
  Future<void> _rememberCategory(String wsId, String categoryId) async {
    try {
      await _settingsRepository.setLastIncomeCategory(wsId, categoryId);
    } on Object {
      // Preferences are not part of the invoice transaction.
    }
  }

  Future<void> _acknowledgeReceipt() async {
    try {
      await _season.acknowledgeCompletion();
    } on Object {
      // Retain the confirmed/prepared journal for the next authenticated entry.
    }
  }

  Future<void> _recoverSale() async {
    final actor = _actorId;
    final workspace = _wsId;
    _update(() => _saving = true);
    try {
      await _season.retryPending();
      if (!mounted || actor != _actorId || workspace != _wsId) return;
      _update(() => _saleCompleted = true);
      unawaited(_acknowledgeReceipt());
      showInventoryToast(context, context.l10n.inventorySaleCreated);
      if (context.canPop()) context.pop(true);
    } on Object {
      if (mounted && actor == _actorId && workspace == _wsId) {
        showInventoryToast(
          context,
          context.l10n.inventorySeasonRetryPending,
          destructive: true,
        );
      }
    } finally {
      if (mounted) _update(() => _saving = false);
    }
  }

  Widget _buildRecovery(BuildContext context) {
    final l10n = context.l10n;
    final record = _season.operation;
    final completed = _saleCompleted || _season.completedInvoiceId != null;
    final payload = record?.payload;
    return FinanceFullscreenFormScaffold(
      title: l10n.inventorySeasonRecoveryTitle,
      primaryActionLabel: l10n.inventorySeasonRecoveryCheck,
      onPrimaryPressed:
          !completed && _season.hasPending && _season.journalReady && !_saving
          ? _recoverSale
          : null,
      isSaving: _saving,
      onClose: _saving
          ? null
          : () {
              if (completed) unawaited(_acknowledgeReceipt());
              if (context.canPop()) context.pop(completed ? true : null);
            },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            completed
                ? l10n.inventorySaleCreated
                : _season.journalFailed
                ? l10n.inventorySeasonRecoveryUnavailable
                : l10n.inventorySeasonRetryPending,
          ),
          if (record != null) ...[
            Text(record.periodName),
            Text(
              l10n.inventorySeasonPriceAsOf(
                record.currency,
                record.asOf.toUtc().toIso8601String(),
                record.timeZone,
              ),
            ),
            Text(payload!['content'] as String),
            for (final row in payload['products'] as List<dynamic>)
              _recoveryLine(row as Map<String, dynamic>),
          ],
        ],
      ),
    );
  }

  Widget _recoveryLine(Map<String, dynamic> row) {
    final record = _season.operation!;
    final price = formatSeasonPrice(
      (row['price'] as num).toDouble(),
      record.currency,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            record.labelFor(row) ?? context.l10n.inventoryCheckoutSelectedItems,
          ),
          Text('${row['quantity']} × $price'),
        ],
      ),
    );
  }
}
