class SupportedCurrency {
  const SupportedCurrency({required this.code, required this.name});

  final String code;
  final String name;
}

const supportedCurrencies = <SupportedCurrency>[
  SupportedCurrency(code: 'AED', name: 'UAE Dirham'),
  SupportedCurrency(code: 'AUD', name: 'Australian Dollar'),
  SupportedCurrency(code: 'BRL', name: 'Brazilian Real'),
  SupportedCurrency(code: 'CAD', name: 'Canadian Dollar'),
  SupportedCurrency(code: 'CHF', name: 'Swiss Franc'),
  SupportedCurrency(code: 'CNY', name: 'Chinese Yuan'),
  SupportedCurrency(code: 'CZK', name: 'Czech Koruna'),
  SupportedCurrency(code: 'DKK', name: 'Danish Krone'),
  SupportedCurrency(code: 'EUR', name: 'Euro'),
  SupportedCurrency(code: 'GBP', name: 'British Pound'),
  SupportedCurrency(code: 'HKD', name: 'Hong Kong Dollar'),
  SupportedCurrency(code: 'HUF', name: 'Hungarian Forint'),
  SupportedCurrency(code: 'IDR', name: 'Indonesian Rupiah'),
  SupportedCurrency(code: 'INR', name: 'Indian Rupee'),
  SupportedCurrency(code: 'JPY', name: 'Japanese Yen'),
  SupportedCurrency(code: 'KRW', name: 'South Korean Won'),
  SupportedCurrency(code: 'MXN', name: 'Mexican Peso'),
  SupportedCurrency(code: 'MYR', name: 'Malaysian Ringgit'),
  SupportedCurrency(code: 'NOK', name: 'Norwegian Krone'),
  SupportedCurrency(code: 'NZD', name: 'New Zealand Dollar'),
  SupportedCurrency(code: 'PHP', name: 'Philippine Peso'),
  SupportedCurrency(code: 'PLN', name: 'Polish Zloty'),
  SupportedCurrency(code: 'SAR', name: 'Saudi Riyal'),
  SupportedCurrency(code: 'SEK', name: 'Swedish Krona'),
  SupportedCurrency(code: 'SGD', name: 'Singapore Dollar'),
  SupportedCurrency(code: 'THB', name: 'Thai Baht'),
  SupportedCurrency(code: 'TWD', name: 'Taiwan Dollar'),
  SupportedCurrency(code: 'USD', name: 'US Dollar'),
  SupportedCurrency(code: 'VND', name: 'Vietnamese Dong'),
  SupportedCurrency(code: 'ZAR', name: 'South African Rand'),
];

bool isSupportedCurrencyCode(String currencyCode) {
  final normalized = currencyCode.trim().toUpperCase();
  return supportedCurrencies.any((currency) => currency.code == normalized);
}

SupportedCurrency? getSupportedCurrency(String currencyCode) {
  final normalized = currencyCode.trim().toUpperCase();
  for (final currency in supportedCurrencies) {
    if (currency.code == normalized) {
      return currency;
    }
  }
  return null;
}
