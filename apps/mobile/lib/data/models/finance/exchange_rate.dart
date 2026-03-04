import 'package:equatable/equatable.dart';

class ExchangeRate extends Equatable {
  const ExchangeRate({
    required this.baseCurrency,
    required this.targetCurrency,
    required this.rate,
    required this.date,
  });

  factory ExchangeRate.fromJson(Map<String, dynamic> json) => ExchangeRate(
    baseCurrency: json['base_currency'] as String? ?? 'USD',
    targetCurrency: json['target_currency'] as String? ?? 'USD',
    rate: () {
      final parsedRate = (json['rate'] as num?)?.toDouble();
      if (parsedRate == null || parsedRate <= 0) {
        throw const FormatException('Invalid exchange rate value');
      }
      return parsedRate;
    }(),
    date: json['date'] as String? ?? '',
  );

  final String baseCurrency;
  final String targetCurrency;
  final double rate;
  final String date;

  @override
  List<Object?> get props => [baseCurrency, targetCurrency, rate, date];
}
