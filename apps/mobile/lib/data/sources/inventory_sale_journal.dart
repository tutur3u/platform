import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Independent of cache eviction, logout and the automatic offline queue.
class InventorySaleJournal {
  InventorySaleJournal({
    Future<String?> Function(String)? read,
    Future<void> Function(String, String)? write,
    Future<void> Function(String)? remove,
  }) : _read = read ?? ((key) => _storage.read(key: key)),
       _write =
           write ?? ((key, value) => _storage.write(key: key, value: value)),
       _remove = remove ?? ((key) => _storage.delete(key: key));

  static const _storage = FlutterSecureStorage();
  static final instance = InventorySaleJournal();
  static final _locks = <String, Future<void>>{};
  final Future<String?> Function(String) _read;
  final Future<void> Function(String, String) _write;
  final Future<void> Function(String) _remove;

  String _key(String actor, String workspace) =>
      'inventory_sale_v1:${Uri.encodeComponent(actor)}:'
      '${Uri.encodeComponent(workspace)}';

  /// App-wide serialization includes the network attempt, across controllers.
  Future<T> locked<T>(
    String actor,
    String workspace,
    Future<T> Function() action,
  ) async {
    final key = _key(actor, workspace);
    final previous = _locks[key] ?? Future<void>.value();
    final released = Completer<void>();
    _locks[key] = released.future;
    await previous;
    try {
      return await action();
    } finally {
      released.complete();
      if (identical(_locks[key], released.future)) {
        unawaited(_locks.remove(key));
      }
    }
  }

  Future<InventorySaleOperation?> read(String actor, String workspace) async {
    final raw = await _read(_key(actor, workspace));
    if (raw == null) return null;
    final result = InventorySaleOperation.decode(raw);
    if (result.actor != actor || result.workspace != workspace) {
      throw const FormatException('Operation scope mismatch');
    }
    return result;
  }

  /// A write must complete and round-trip exactly before any POST is allowed.
  Future<void> write(InventorySaleOperation operation) async {
    final key = _key(operation.actor, operation.workspace);
    final raw = operation.encode();
    await _write(key, raw);
    if (await _read(key) != raw) {
      throw StateError('Operation was not durably stored');
    }
  }

  Future<void> acknowledge(String actor, String workspace, String invoiceId) =>
      locked(actor, workspace, () async {
        final stored = await read(actor, workspace);
        if (stored == null) return;
        if (stored.invoiceId != invoiceId) {
          throw StateError('Unresolved operation cannot be removed');
        }
        await _remove(_key(actor, workspace));
      });
}

/// Immutable serialized body; reading a payload returns a detached copy.
class InventorySaleOperation {
  InventorySaleOperation({
    required this.actor,
    required this.workspace,
    required this.requestId,
    required this.body,
    required this.currency,
    required this.periodName,
    required this.timeZone,
    required this.asOf,
    required this.createdAt,
    this.labels = '{}',
    this.invoiceId,
  });

  factory InventorySaleOperation.decode(String raw) {
    final data = jsonDecode(raw) as Map<String, dynamic>;
    if (data['version'] != 1) {
      throw const FormatException('Unsupported journal');
    }
    final operation = InventorySaleOperation(
      actor: data['actor'] as String,
      workspace: data['workspace'] as String,
      requestId: data['request_id'] as String,
      body: data['body'] as String,
      currency: data['currency'] as String,
      periodName: data['period_name'] as String,
      timeZone: data['time_zone'] as String,
      asOf: DateTime.parse(data['as_of'] as String),
      createdAt: DateTime.parse(data['created_at'] as String),
      invoiceId: data['invoice_id'] as String?,
      labels: data['labels'] as String? ?? '{}',
    );
    final payload = operation.payload;
    final labels = jsonDecode(operation.labels) as Map<String, dynamic>;
    if (labels.values.any((value) => value is! String)) {
      throw const FormatException('Invalid stored labels');
    }
    if (operation.actor.isEmpty ||
        operation.workspace.isEmpty ||
        operation.requestId.isEmpty ||
        payload['inventory_request_id'] != operation.requestId ||
        payload['inventory_period_id'] is! String ||
        payload['products'] is! List ||
        (payload['products'] as List).isEmpty ||
        operation.currency.isEmpty ||
        (operation.invoiceId != null && operation.invoiceId!.isEmpty)) {
      throw const FormatException('Invalid stored operation');
    }
    for (final rawLine in payload['products'] as List) {
      final line = rawLine as Map<String, dynamic>;
      final quantity = line['quantity'];
      final price = line['price'];
      if (quantity is! int ||
          quantity <= 0 ||
          quantity > 9007199254740991 ||
          price is! num ||
          !price.isFinite ||
          price < 0 ||
          ['product_id', 'unit_id', 'warehouse_id', 'price_id'].any(
            (key) => line[key] is! String || (line[key] as String).isEmpty,
          )) {
        throw const FormatException('Invalid stored line');
      }
    }
    if (payload['content'] is! String ||
        payload['wallet_id'] is! String ||
        payload['category_id'] is! String) {
      throw const FormatException('Invalid stored invoice');
    }
    return operation;
  }

  final String actor;
  final String workspace;
  final String requestId;
  final String body;
  final String currency;
  final String periodName;
  final String timeZone;
  final DateTime asOf;
  final DateTime createdAt;
  final String? invoiceId;
  final String labels;
  String? labelFor(Map<String, dynamic> row) {
    final key =
        '${row['product_id']}|${row['unit_id']}|'
        '${row['warehouse_id']}';
    return (jsonDecode(labels) as Map<String, dynamic>)[key] as String?;
  }

  Map<String, dynamic> get payload => jsonDecode(body) as Map<String, dynamic>;

  InventorySaleOperation confirmed(String id) => InventorySaleOperation(
    actor: actor,
    workspace: workspace,
    requestId: requestId,
    body: body,
    currency: currency,
    periodName: periodName,
    timeZone: timeZone,
    asOf: asOf,
    createdAt: createdAt,
    invoiceId: id,
    labels: labels,
  );

  String encode() => jsonEncode({
    'version': 1,
    'actor': actor,
    'workspace': workspace,
    'request_id': requestId,
    'body': body,
    'labels': labels,
    'currency': currency,
    'period_name': periodName,
    'time_zone': timeZone,
    'as_of': asOf.toUtc().toIso8601String(),
    'created_at': createdAt.toUtc().toIso8601String(),
    if (invoiceId != null) 'invoice_id': invoiceId,
  });
}
