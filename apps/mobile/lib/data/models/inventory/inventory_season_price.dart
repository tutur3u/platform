import 'dart:math';

import 'package:intl/intl.dart';

int seasonCurrencyScale(String code) =>
    pow(10, NumberFormat.currency(name: code).decimalDigits ?? 2).toInt();

/// Uncached server quote. Prices apply on [validFrom, validTo), at server asOf.
class InventorySeasonPrice {
  const InventorySeasonPrice({
    required this.id,
    required this.periodId,
    required this.productId,
    required this.unitId,
    required this.warehouseId,
    required this.currency,
    required this.price,
    required this.validFrom,
    this.validTo,
  });

  factory InventorySeasonPrice.fromJson(Map<String, dynamic> json) {
    String text(String key) {
      final value = json[key];
      if (value is! String || value.isEmpty) throw FormatException(key);
      return value;
    }

    final price = json['price'];
    if (price is! num || !price.isFinite || price < 0) {
      throw const FormatException('Invalid season price');
    }
    final from = serverInstant(text('valid_from'));
    final to = json['valid_to'] == null
        ? null
        : serverInstant(text('valid_to'));
    if (to != null && !to.isAfter(from)) {
      throw const FormatException('Invalid price interval');
    }
    final currency = text('currency').toUpperCase();
    if (!RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
      throw const FormatException('Invalid currency');
    }
    return InventorySeasonPrice(
      id: text('id'),
      periodId: text('period_id'),
      productId: text('product_id'),
      unitId: text('unit_id'),
      warehouseId: text('warehouse_id'),
      currency: currency,
      price: price.toDouble(),
      validFrom: from,
      validTo: to,
    );
  }

  final String id;
  final String periodId;
  final String productId;
  final String unitId;
  final String warehouseId;
  final String currency;
  final double price;
  final DateTime validFrom;
  final DateTime? validTo;
  String get key => '$productId|$unitId|$warehouseId';
  bool applies(DateTime instant) =>
      !instant.isBefore(validFrom) &&
      (validTo == null || instant.isBefore(validTo!));
}

DateTime serverInstant(String value) {
  if (!RegExp(r'(Z|[+-]\d\d:\d\d)$').hasMatch(value)) {
    throw const FormatException('Server instant needs timezone');
  }
  return DateTime.parse(value).toUtc();
}

class InventorySeasonQuote {
  const InventorySeasonQuote({required this.asOf, required this.prices});
  factory InventorySeasonQuote.fromJson(Map<String, dynamic> json) {
    if (json['as_of'] is! String || json['data'] is! List) {
      throw const FormatException('Missing season quote');
    }
    final rows = <InventorySeasonPrice>[];
    for (final row in json['data'] as List<dynamic>) {
      if (row is! Map<String, dynamic>) {
        throw const FormatException('Invalid price row');
      }
      rows.add(InventorySeasonPrice.fromJson(row));
    }
    return InventorySeasonQuote(
      asOf: serverInstant(json['as_of'] as String),
      prices: List.unmodifiable(rows),
    );
  }
  final DateTime asOf;
  final List<InventorySeasonPrice> prices;

  Map<String, InventorySeasonPrice> resolve(String periodId, String currency) {
    final result = <String, InventorySeasonPrice>{};
    for (final row in prices) {
      if (row.periodId != periodId ||
          row.currency != currency.toUpperCase() ||
          !row.applies(asOf)) {
        continue;
      }
      final minor = row.price * seasonCurrencyScale(row.currency);
      if (minor < 0 ||
          minor > 9007199254740991 ||
          (minor - minor.round()).abs() > 0.000001) {
        throw const FormatException('Invalid currency precision');
      }
      if (result.containsKey(row.key)) {
        throw const FormatException('Overlapping effective prices');
      }
      result[row.key] = row;
    }
    return Map.unmodifiable(result);
  }
}
