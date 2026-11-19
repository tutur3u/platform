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
