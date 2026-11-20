String? _label(Object? row, List<String> keys) {
  if (row is! Map) return null;
  for (final key in keys) {
    final value = row[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
  }
  return null;
}

double? _amount(Object? value) => switch (value) {
  num() => value.toDouble(),
  String() => double.tryParse(value),
  _ => null,
};

class FinanceInvoice {
  const FinanceInvoice({
    required this.id,
    this.total,
    this.customer,
    this.creator,
    this.wallet,
    this.walletId,
    this.notice,
    this.note,
    this.createdAt,
    this.completedAt,
    this.coverage,
  });

  factory FinanceInvoice.fromJson(Map<String, dynamic> json) {
    final months = json['subscription_months'];
    return FinanceInvoice(
      id: json['id'] as String,
      total: _amount(json['price']),
      customer: _label(json['customer'], ['display_name', 'full_name']),
      creator: _label(json['creator'], ['display_name', 'full_name', 'email']),
      wallet: _label(json['wallet'], ['name']),
      walletId: json['wallet_id'] as String?,
      notice: json['notice'] as String?,
      note: json['note'] as String?,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
      completedAt: DateTime.tryParse(json['completed_at'] as String? ?? ''),
      coverage: months is List ? months.whereType<String>().join(', ') : null,
    );
  }

  final String id;
  final double? total;
  final String? customer;
  final String? creator;
  final String? wallet;
  final String? walletId;
  final String? notice;
  final String? note;
  final DateTime? createdAt;
  final DateTime? completedAt;
  final String? coverage;
}

class FinancePendingInvoice {
  const FinancePendingInvoice({
    required this.customerId,
    required this.customer,
    required this.groups,
    required this.months,
    this.total,
  });

  factory FinancePendingInvoice.fromJson(Map<String, dynamic> json) {
    final months = json['months_owed'];
    return FinancePendingInvoice(
      customerId: json['user_id'] as String,
      customer: json['user_name'] as String? ?? '',
      groups:
          (json['group_ids'] as List?)?.whereType<String>().toList() ??
          [if (json['group_id'] case final String id) id],
      months: switch (months) {
        List() => months.whereType<String>().toList(),
        String() =>
          months
              .split(',')
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(),
        _ => const [],
      },
      total: _amount(json['potential_total']),
    );
  }

  final String customerId;
  final String customer;
  final List<String> groups;
  final List<String> months;
  final double? total;
}

class FinanceInvoiceLine {
  const FinanceInvoiceLine({
    required this.productId,
    required this.name,
    required this.unitId,
    required this.warehouseId,
    required this.quantity,
    required this.price,
  });

  final String productId;
  final String name;
  final String unitId;
  final String warehouseId;
  final double quantity;
  final double price;

  String get key => '$productId/$unitId/$warehouseId';

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'unit_id': unitId,
    'warehouse_id': warehouseId,
    'quantity': quantity,
    'price': price,
  };
}

typedef FinancePageResult<T> = ({List<T> items, int count});
typedef FinanceSubscriptionTerms = ({
  List<String> groups,
  String month,
  int months,
});

typedef FinanceSubscriptionGroup = ({
  String id,
  String name,
  DateTime? start,
  DateTime? end,
});

class FinanceInvoiceEvent {
  FinanceInvoiceEvent.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      invoiceId = json['invoice_id'] as String,
      action = json['operation'] as String,
      actor = json['actor_name'] as String?,
      customer = json['customer_name'] as String?,
      currency = json['currency'] as String?,
      amount = _amount(json['amount']),
      at = DateTime.tryParse(json['occurred_at'] as String? ?? ''),
      canRestore = json['can_restore'] == true;

  final String id;
  final String invoiceId;
  final String action;
  final String? actor;
  final String? customer;
  final String? currency;
  final double? amount;
  final DateTime? at;
  final bool canRestore;
}

class FinanceFeeLockRow {
  FinanceFeeLockRow.fromJson(Map<String, dynamic> json, this.currency)
    : studentId = json['student_id'] as String,
      student = json['student_name'] as String,
      lockId = (json['lock'] as Map<String, dynamic>?)?['id'] as String?,
      status = (json['lock'] as Map<String, dynamic>?)?['status'] as String?,
      amount = _amount(json['baseline_total']) ?? 0,
      baseline = [
        for (final row
            in (json['classes'] as List<dynamic>).cast<Map<String, dynamic>>())
          if ((_amount(row['baseline_quantity']) ?? 0) > 0 &&
              row['product_id'] != null &&
              row['unit_id'] != null &&
              row['warehouse_id'] != null)
            FinanceFeeLine.baseline(row),
      ];

  final String studentId;
  final String student;
  final String? lockId;
  final String? status;
  final String currency;
  final double amount;
  final List<FinanceFeeLine> baseline;
}

typedef FinanceFeeLockDetail = ({
  String? status,
  int? version,
  String currency,
  String note,
  List<FinanceFeeLine> lines,
});

class FinanceFeeLine {
  FinanceFeeLine.baseline(Map<String, dynamic> row)
    : this.fromJson({
        ...row,
        'kind': 'tuition',
        'label': row['group_name'],
        'quantity': row['baseline_quantity'],
        'line_amount': row['baseline_amount'],
      });

  FinanceFeeLine.fromJson(Map<String, dynamic> row)
    : _data = row,
      kind = row['kind'] as String,
      label = row['label'] as String,
      quantity = _amount(row['quantity'])!,
      amount = _amount(row['line_amount'])!;

  final Map<String, dynamic> _data;
  final String kind;
  final String label;
  final double quantity;
  final double amount;

  Map<String, dynamic> toDraft({
    required double quantity,
    required String editedReason,
  }) {
    final groupId = _data['group_id'] as String?;
    if (kind == 'tuition') {
      return {
        'kind': kind,
        'group_id': groupId,
        'quantity': quantity,
        if (_data['adjustment_amount'] case final num adjustment)
          'adjustment_amount': adjustment,
        if (quantity != this.quantity)
          'reason': editedReason
        else if (_data['reason'] case final String reason)
          'reason': reason,
      };
    }

    return {
      'kind': kind,
      if (groupId != null) 'group_id': groupId,
      'quantity': quantity,
      if (_data['product_id'] case final String product) ...{
        'source': 'catalog',
        'product_id': product,
        'unit_id': _data['unit_id'],
        'warehouse_id': _data['warehouse_id'],
      } else ...{
        'source': 'free_text',
        'label': label,
        'unit_label': _data['unit_label'],
        'unit_price': _amount(_data['unit_price']),
      },
    };
  }
}

double _detailNumber(Object? value) => switch (value) {
  final num number => number.toDouble(),
  final String text => double.tryParse(text) ?? 0,
  _ => 0,
};

/// One product line of an invoice.
class FinanceInvoiceDetailLine {
  const FinanceInvoiceDetailLine({
    required this.name,
    required this.quantity,
    required this.price,
    this.unit,
    this.warehouse,
  });

  factory FinanceInvoiceDetailLine.fromJson(Map<String, dynamic> json) =>
      FinanceInvoiceDetailLine(
        name: json['product_name'] as String? ?? '',
        quantity: _detailNumber(json['amount']),
        price: _detailNumber(json['price']),
        unit: json['product_unit'] as String?,
        warehouse: json['warehouse'] as String?,
      );

  final String name;
  final double quantity;
  final double price;
  final String? unit;
  final String? warehouse;

  double get total => quantity * price;
}

/// A promotion as applied to an invoice when it was created.
class FinanceInvoiceDetailPromotion {
  const FinanceInvoiceDetailPromotion({
    required this.code,
    required this.value,
    required this.useRatio,
    this.name,
  });

  factory FinanceInvoiceDetailPromotion.fromJson(Map<String, dynamic> json) =>
      FinanceInvoiceDetailPromotion(
        code: json['code'] as String? ?? '',
        name: json['name'] as String?,
        value: _detailNumber(json['value']),
        useRatio: json['use_ratio'] as bool? ?? true,
      );

  final String code;
  final String? name;
  final double value;
  final bool useRatio;
}

/// An invoice with its lines and promotions, as the invoice detail
/// endpoint returns it. [subtotal] is the price before adjustments and
/// [adjustment] the signed difference (negative for a discount).
class FinanceInvoiceDetail {
  const FinanceInvoiceDetail({
    required this.id,
    required this.subtotal,
    required this.adjustment,
    this.customerName,
    this.walletName,
    this.currency,
    this.createdAt,
    this.notice,
    this.lines = const [],
    this.promotions = const [],
  });

  factory FinanceInvoiceDetail.fromJson(Map<String, dynamic> json) =>
      FinanceInvoiceDetail(
        id: json['id'] as String,
        subtotal: _detailNumber(json['price']),
        adjustment: _detailNumber(json['total_diff']),
        customerName: json['customer_name'] as String?,
        walletName: json['wallet_name'] as String?,
        currency: json['wallet_currency'] as String?,
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
        notice: json['notice'] as String?,
        lines: [
          for (final row
              in (json['products'] as List<dynamic>? ?? const [])
                  .whereType<Map<String, dynamic>>())
            FinanceInvoiceDetailLine.fromJson(row),
        ],
        promotions: [
          for (final row
              in (json['promotions'] as List<dynamic>? ?? const [])
                  .whereType<Map<String, dynamic>>())
            FinanceInvoiceDetailPromotion.fromJson(row),
        ],
      );

  final String id;
  final double subtotal;
  final double adjustment;
  final String? customerName;
  final String? walletName;
  final String? currency;
  final DateTime? createdAt;
  final String? notice;
  final List<FinanceInvoiceDetailLine> lines;
  final List<FinanceInvoiceDetailPromotion> promotions;

  double get total => subtotal + adjustment;
}
