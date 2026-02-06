import 'package:intl/intl.dart';

/// Formats [amount] as a currency string with symbol and thousand separators.
///
/// For VND the result omits decimals (e.g. `₫65,000,000`); other currencies
/// use two decimal places.
String formatCurrency(double amount, String currencyCode) {
  final code = currencyCode.toUpperCase();
  final digits = code == 'VND' || code == 'JPY' ? 0 : 2;
  final format = NumberFormat.currency(
    symbol: currencySymbol(code),
    decimalDigits: digits,
  );
  return format.format(amount);
}

/// Returns the conventional symbol for common currency codes.
String currencySymbol(String code) {
  return switch (code.toUpperCase()) {
    'USD' => r'$',
    'VND' => '\u20ab',
    'EUR' => '\u20ac',
    'GBP' => '\u00a3',
    'JPY' => '\u00a5',
    _ => code,
  };
}
