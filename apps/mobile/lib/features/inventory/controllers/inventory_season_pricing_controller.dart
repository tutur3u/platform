import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/inventory/inventory_sales_period.dart';
import 'package:mobile/data/models/inventory/inventory_season_price.dart';
import 'package:mobile/data/sources/inventory_sale_journal.dart';

import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

part 'inventory_season_pricing_recovery.dart';

/// Confirmed sales use a durable journal; cached-price drafts use the outbox.
class InventorySeasonPricingController extends ChangeNotifier {
  InventorySeasonPricingController({
    required this.fetch,
    required this.send,
    required this.isOnline,
    InventorySaleJournal? journal,
    this.lookupReceipt,
    this.enqueueOffline,
    this.currentActor,
    DateTime Function()? now,
    String Function()? requestId,
  }) : journal = journal ?? InventorySaleJournal.instance,
       now = now ?? DateTime.now,
       requestId = requestId ?? newLocalMutationId {
    tzdata.initializeTimeZones();
  }
  final Future<InventorySeasonQuote> Function(String, String) fetch;
  final Future<String> Function(String, Map<String, dynamic>) send;
  final Future<bool> Function() isOnline;
  final Future<String> Function(String, Map<String, dynamic>)? enqueueOffline;
  bool queuedOffline = false;
  bool get offlineDraft => quote?.isCached == true && enqueueOffline != null;
  final InventorySaleJournal journal;
  final Future<String?> Function(String, String)? lookupReceipt;
  final String? Function()? currentActor;
  InventorySaleOperation? operation;
  Future<void> _restoreFuture = Future<void>.value();
  bool restoring = true;
  bool journalFailed = false;
  String? completedInvoiceId;
  String? queuedMutationId;
  String _draftLabels = '{}';
  bool get journalReady =>
      !restoring && !journalFailed && _actor != null && _workspace != null;
  final DateTime Function() now;
  final String Function() requestId;
  String? _actor;
  String? _workspace;
  InventorySalesPeriod? period;
  String currency = '';
  InventorySeasonQuote? quote;
  Map<String, InventorySeasonPrice> prices = const {};
  DateTime? _receivedAt;
  DateTime? _lastFetchAttempt;
  int _generation = 0;
  bool _disposed = false;
  bool loading = false;
  bool sending = false;
  bool _lastNotifiedFresh = false;
  Map<String, dynamic>? _pending;
  bool get hasPending => _pending != null;
  bool get scheduled => period?.isScheduled ?? false;
  bool get fresh =>
      quote != null &&
      _receivedAt != null &&
      now().difference(_receivedAt!) >= Duration.zero &&
      now().difference(_receivedAt!) < const Duration(seconds: 15);
  bool get ready =>
      journalReady &&
      completedInvoiceId == null &&
      !queuedOffline &&
      scheduled &&
      (fresh || offlineDraft) &&
      !loading &&
      _eligiblePeriod();

  void configure({
    required String? actorId,
    required String? workspaceId,
    required InventorySalesPeriod? selectedPeriod,
    required String currency,
  }) {
    if (_actor == actorId &&
        _workspace == workspaceId &&
        period == selectedPeriod &&
        this.currency == currency.toUpperCase()) {
      return;
    }
    // Freeze pending metadata in this scope; changing scope only hides
    // the record.
    if (operation != null && _actor == actorId && _workspace == workspaceId) {
      return;
    }
    _generation++;
    _actor = actorId;
    _workspace = workspaceId;
    period = selectedPeriod;
    this.currency = currency.toUpperCase();
    _pending = null;
    operation = null;
    completedInvoiceId = null;
    queuedMutationId = null;
    queuedOffline = false;
    restoring = true;
    journalFailed = false;
    _lastFetchAttempt = null;
    sending = false;
    _clear();
    _restoreFuture = _restoreOperation(_generation, actorId, workspaceId);
    _notify();
  }

  void _clear() {
    quote = null;
    prices = const {};
    _receivedAt = null;
    _lastNotifiedFresh = false;
    loading = false;
  }

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  bool _eligiblePeriod() {
    final p = period;
    final q = quote;
    if (p == null ||
        q == null ||
        p.status != 'active' ||
        p.startsAt == null ||
        p.endsAt == null ||
        p.timeZone == null) {
      return false;
    }
    try {
      final local = tz.TZDateTime.from(q.asOf, tz.getLocation(p.timeZone!));
      final day = DateTime.utc(local.year, local.month, local.day);
      final start = DateTime.utc(
        p.startsAt!.year,
        p.startsAt!.month,
        p.startsAt!.day,
      );
      final end = DateTime.utc(p.endsAt!.year, p.endsAt!.month, p.endsAt!.day);
      return !day.isBefore(start) && !day.isAfter(end);
    } on Object {
      return false;
    }
  }

  bool allowsProduct(String id) => switch (period?.productScope) {
    'all' => true,
    'allowlist' => period!.productIds.contains(id),
    'blocklist' => !period!.productIds.contains(id),
    _ => false,
  };

  InventorySeasonPrice? priceFor(String key, String productId) {
    final price = prices[key];
    if (hasPending) {
      final lines = _pending!['products'] as List<dynamic>;
      return price != null &&
              lines.any(
                (dynamic row) =>
                    (row as Map<String, dynamic>)['price_id'] == price.id,
              )
          ? price
          : null;
    }
    return ready && allowsProduct(productId) ? price : null;
  }

  Future<void> refresh({bool automatic = false}) async {
    await _restoreFuture;
    if (!journalReady ||
        !scheduled ||
        hasPending ||
        completedInvoiceId != null) {
      return;
    }
    final instant = now();
    final elapsed = _lastFetchAttempt == null
        ? null
        : instant.difference(_lastFetchAttempt!);
    if (automatic &&
        elapsed != null &&
        elapsed >= Duration.zero &&
        elapsed < const Duration(seconds: 10)) {
      return;
    }
    _lastFetchAttempt = instant;
    final token = ++_generation;
    final workspace = _workspace!;
    final periodId = period!.id;
    _clear();
    loading = true;
    _notify();
    try {
      if (!await isOnline() && enqueueOffline == null) {
        throw StateError('Scheduled sales require online access');
      }
      final result = await fetch(workspace, periodId);
      if (token != _generation || _disposed) {
        return;
      }
      final resolved = result.resolve(periodId, currency);
      quote = result;
      prices = resolved;
      _receivedAt = now();
      _lastNotifiedFresh = fresh;
    } on Object {
      if (token == _generation && !_disposed) _clear();
    } finally {
      if (token == _generation && !_disposed) {
        loading = false;
        _notify();
      }
    }
  }

  void tick() {
    if (!scheduled) return;
    final currentFresh = fresh;
    if (currentFresh == _lastNotifiedFresh) return;
    _lastNotifiedFresh = currentFresh;
    _notify();
  }

  Future<String> submit({
    required String walletId,
    required String categoryId,
    required List<Map<String, dynamic>> products,
    required String content,
    String? notes,
    Map<String, String> lineLabels = const {},
  }) async {
    await _restoreFuture;
    if (sending ||
        !journalReady ||
        completedInvoiceId != null ||
        queuedOffline) {
      throw StateError('Operation recovery required');
    }
    final admission = _generation;
    final online = await isOnline();
    if (!online && !offlineDraft) {
      throw StateError('Cached season prices are required for offline sales');
    }
    if (sending || admission != _generation || _disposed) {
      throw StateError('Scope changed');
    }
    if (_pending == null) {
      _draftLabels = jsonEncode(lineLabels);
      if (!ready || products.isEmpty || products.length > 500) {
        throw StateError('Refresh season prices');
      }
      final lines = <Map<String, dynamic>>[];
      var totalMinor = 0;
      for (final row in products) {
        final key =
            '${row['product_id']}|${row['unit_id']}|${row['warehouse_id']}';
        final p = priceFor(key, row['product_id'] as String);
        final qty = row['quantity'];
        if (p == null || qty is! int || qty <= 0 || qty > 9007199254740991) {
          throw StateError('Invalid scheduled sale line');
        }
        final unitMinor = (p.price * seasonCurrencyScale(currency)).round();
        if (unitMinor > 0 && qty > 9007199254740991 ~/ unitMinor) {
          throw StateError('Sale exceeds supported precision');
        }
        final lineMinor = unitMinor * qty;
        if (totalMinor > 9007199254740991 - lineMinor) {
          throw StateError('Sale exceeds supported precision');
        }
        totalMinor += lineMinor;
        lines.add({
          'product_id': p.productId,
          'unit_id': p.unitId,
          'warehouse_id': p.warehouseId,
          'quantity': qty,
          'price': p.price,
          'price_id': p.id,
        });
      }
      // Serialize once to detach the retry payload from mutable cart maps.
      _pending =
          jsonDecode(
                jsonEncode({
                  'customer_id': null,
                  'content': content,
                  if (notes != null && notes.isNotEmpty) 'notes': notes,
                  'wallet_id': walletId,
                  'category_id': categoryId,
                  'price_mode': 'custom',
                  'inventory_period_id': period!.id,
                  'inventory_request_id': requestId(),
                  'products': lines,
                }),
              )
              as Map<String, dynamic>;
    }
    if (!online && _pending != null) {
      sending = true;
      _notify();
      try {
        final id = await enqueueOffline!(_workspace!, _pending!);
        if (admission == _generation && !_disposed) {
          queuedOffline = true;
          queuedMutationId = id;
          _pending = null;
          _notify();
        }
        return id;
      } finally {
        if (admission == _generation && !_disposed) {
          sending = false;
          _notify();
        }
      }
    }
    return await _attemptOperation(admission);
  }

  Future<String> retryPending() async {
    await _restoreFuture;
    if (!journalReady || !hasPending || sending) {
      throw StateError('Operation recovery required');
    }
    final token = _generation;
    if (!await isOnline() || token != _generation || _disposed) {
      throw StateError('Online recovery required');
    }
    return await _attemptOperation(token);
  }

  Future<void> acknowledgeCompletion() async {
    final actor = _actor;
    final workspace = _workspace;
    final id = completedInvoiceId;
    if (actor != null && workspace != null && id != null) {
      await journal.acknowledge(actor, workspace, id);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}
