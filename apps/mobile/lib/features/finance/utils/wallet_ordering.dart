import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/wallet.dart';

const double _walletZeroTolerance = 0.000001;

double walletDisplayNet({
  required Wallet wallet,
  required String workspaceCurrency,
  required List<ExchangeRate> exchangeRates,
}) {
  final balance = wallet.balance ?? 0;
  final walletCurrency = (wallet.currency ?? workspaceCurrency)
      .trim()
      .toUpperCase();
  final targetCurrency = workspaceCurrency.trim().toUpperCase();

  if (walletCurrency == targetCurrency) {
    return balance;
  }

  return convertCurrency(
        balance,
        walletCurrency,
        targetCurrency,
        exchangeRates,
      ) ??
      balance;
}

bool isWalletDisplayNetZero({
  required Wallet wallet,
  required String workspaceCurrency,
  required List<ExchangeRate> exchangeRates,
}) {
  return walletDisplayNet(
        wallet: wallet,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      ).abs() <
      _walletZeroTolerance;
}

List<Wallet> sortWalletsForDisplay({
  required List<Wallet> wallets,
  required String workspaceCurrency,
  required List<ExchangeRate> exchangeRates,
}) {
  final sorted = [...wallets]
    ..sort((a, b) {
      final aNet = walletDisplayNet(
        wallet: a,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      );
      final bNet = walletDisplayNet(
        wallet: b,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      );
      final aZero = aNet.abs() < _walletZeroTolerance;
      final bZero = bNet.abs() < _walletZeroTolerance;

      if (aZero != bZero) {
        return aZero ? 1 : -1;
      }

      final netCompare = bNet.compareTo(aNet);
      if (netCompare != 0) {
        return netCompare;
      }

      return (a.name ?? '').toLowerCase().compareTo(
        (b.name ?? '').toLowerCase(),
      );
    });
  return sorted;
}
