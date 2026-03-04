import 'package:mobile/data/models/finance/exchange_rate.dart';

double? convertCurrency(
  double amount,
  String fromCurrency,
  String toCurrency,
  List<ExchangeRate> rates,
) {
  final from = fromCurrency.toUpperCase();
  final to = toCurrency.toUpperCase();

  if (from == to) return amount;

  final fromRate = from == 'USD'
      ? 1.0
      : rates
            .where(
              (rate) =>
                  rate.baseCurrency.toUpperCase() == 'USD' &&
                  rate.targetCurrency.toUpperCase() == from,
            )
            .firstOrNull
            ?.rate;

  final toRate = to == 'USD'
      ? 1.0
      : rates
            .where(
              (rate) =>
                  rate.baseCurrency.toUpperCase() == 'USD' &&
                  rate.targetCurrency.toUpperCase() == to,
            )
            .firstOrNull
            ?.rate;

  if (fromRate == null || toRate == null || fromRate == 0) return null;
  return amount * (toRate / fromRate);
}
