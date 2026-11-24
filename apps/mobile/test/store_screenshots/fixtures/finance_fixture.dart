import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';

import '../store_screenshot_app.dart';
import 'store_team.dart';

/// The studio's money for launch week. English listings use USD, Vietnamese
/// listings VND, so every amount reads natively in its store.
class StoreFinance {
  const StoreFinance(this.locale);

  final StoreLocale locale;

  String get currency => locale.pick('USD', 'VND');

  double _amount(double usd, double vnd) => locale.pick(usd, vnd);

  static const _studio = 'store-wallet-studio';
  static const _launch = 'store-wallet-launch';
  static const _petty = 'store-wallet-petty';
  static const _card = 'store-wallet-card';

  String _walletName(String id) => switch (id) {
    _studio => locale.pick('Studio account', 'Quỹ studio'),
    _launch => locale.pick('Launch budget', 'Quỹ ra mắt'),
    _petty => locale.pick('Petty cash', 'Tiền mặt'),
    _ => locale.pick('Company card', 'Thẻ công ty'),
  };

  List<Map<String, dynamic>> get wallets => [
    _wallet(
      _studio,
      locale.pick('Client work, payroll', 'Thu chi chính'),
      _amount(18420.50, 465000000),
    ),
    _wallet(_launch, StoreTeam.project(locale), _amount(6250, 158000000)),
    _wallet(
      _petty,
      locale.pick('Coffee and couriers', 'Cà phê, giao nhận'),
      _amount(340, 8500000),
    ),
    _wallet(
      _card,
      locale.pick('Software and ads', 'Phần mềm, quảng cáo'),
      _amount(-1286.40, -32400000),
      type: 'CREDIT',
    ),
  ];

  Map<String, dynamic> _wallet(
    String id,
    String description,
    double balance, {
    String type = 'STANDARD',
  }) => {
    'id': id,
    'name': _walletName(id),
    'description': description,
    'balance': balance,
    'currency': currency,
    'type': type,
    'ws_id': StoreTeam.localeWorkspaceId(locale),
  };

  List<Map<String, dynamic>> get transactions => [
    _transaction(
      'deposit',
      _studio,
      _amount(4800, 120000000),
      locale.pick('Studio project deposit', 'Tiền cọc dự án studio'),
      locale.pick('Client payments', 'Thu từ khách hàng'),
      StoreTeam.at(8, 20),
    ),
    _transaction(
      'figma',
      _card,
      _amount(-225, -5600000),
      locale.pick(
        'Design tool seats for the team',
        'Gói phần mềm thiết kế cho cả nhóm',
      ),
      locale.pick('Software', 'Phần mềm'),
      StoreTeam.at(7, 55),
    ),
    _transaction(
      'print',
      _launch,
      _amount(-186.50, -4650000),
      locale.pick('Launch poster print proofs', 'In thử poster ra mắt'),
      locale.pick('Printing', 'In ấn'),
      StoreTeam.at(16, 10, -1),
    ),
    _transaction(
      'lunch',
      _petty,
      _amount(-94.20, -2350000),
      locale.pick(
        'Team lunch after design review',
        'Ăn trưa sau buổi review thiết kế',
      ),
      locale.pick('Meals', 'Ăn uống'),
      StoreTeam.at(12, 30, -1),
    ),
    _transaction(
      'ads',
      _launch,
      _amount(-600, -15000000),
      locale.pick('Launch ads, first week', 'Quảng cáo ra mắt tuần đầu'),
      locale.pick('Marketing', 'Tiếp thị'),
      StoreTeam.at(9, 0, -2),
    ),
    _transaction(
      'photos',
      _card,
      _amount(-79, -1990000),
      locale.pick('Stock photo license', 'Bản quyền ảnh stock'),
      locale.pick('Software', 'Phần mềm'),
      StoreTeam.at(15, 40, -3),
    ),
    _transaction(
      'courier',
      _petty,
      _amount(-42, -1050000),
      locale.pick('Courier for press kits', 'Giao bộ tài liệu báo chí'),
      locale.pick('Shipping', 'Vận chuyển'),
      StoreTeam.at(11, 5, -4),
    ),
  ];

  Map<String, dynamic> _transaction(
    String id,
    String walletId,
    double amount,
    String description,
    String category,
    DateTime takenAt,
  ) => {
    'id': 'store-tx-$id',
    'amount': amount,
    'description': description,
    'category_name': category,
    'wallet_id': walletId,
    'wallet_name': _walletName(walletId),
    'wallet_currency': currency,
    'taken_at': takenAt.toIso8601String(),
    'created_at': takenAt.toIso8601String(),
  };

  /// This month's money in and out per wallet, as the stats endpoint
  /// reports it: expenses are positive totals.
  TransactionStats monthStats(String? walletId) {
    final (income, expense) = switch (walletId) {
      _studio => (_amount(14200, 355000000), _amount(3640, 91000000)),
      _launch => (0.0, _amount(1980, 49500000)),
      _petty => (0.0, _amount(410, 10250000)),
      _card => (0.0, _amount(1350, 33750000)),
      _ => (0.0, 0.0),
    };
    return TransactionStats(
      totalTransactions: income > 0 ? 6 : 4,
      totalIncome: income,
      totalExpense: expense,
      netTotal: income - expense,
      currency: currency,
    );
  }

  /// The overview snapshot exactly as the finance cubit caches it.
  Map<String, dynamic> get overview => {
    'wallets': wallets,
    'recentTransactions': transactions,
    'workspaceCurrency': currency,
    'exchangeRates': const <Object>[],
    'lastUpdatedAt': null,
  };
}

/// Serves the overview from fixtures. The cubit shows the month totals only
/// after its wallet, transaction, currency and rate loads all succeed, so the
/// repository answers every one of them.
class StoreFinanceRepository extends FinanceRepository {
  StoreFinanceRepository(this.locale);

  final StoreLocale locale;

  StoreFinance get _data => StoreFinance(locale);

  @override
  Future<List<Wallet>> getWallets(String wsId) async => [
    for (final wallet in _data.wallets) Wallet.fromJson(wallet),
  ];

  @override
  Future<InfiniteTransactionResponse> getTransactionsInfinite({
    required String wsId,
    int limit = 20,
    String? cursor,
    String? search,
    String? walletId,
    FinanceTransactionQuery query = const FinanceTransactionQuery(),
  }) async => InfiniteTransactionResponse.fromJson({
    'data': _data.transactions.take(limit).toList(),
    'hasMore': false,
  });

  @override
  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async => _data.currency;

  @override
  Future<List<ExchangeRate>> getExchangeRates() async => const [];

  @override
  Future<TransactionStats> getTransactionStats({
    required String wsId,
    String? walletId,
    String? search,
    FinanceTransactionQuery filters = const FinanceTransactionQuery(),
  }) async => _data.monthStats(walletId);
}

Directory? _cacheDirectory;

/// Opens the app's offline cache in a throwaway directory and stores the
/// overview snapshot the finance page reads first. With no backend behind
/// the repository, the page keeps showing this snapshot.
/// Opens the offline cache in a temp directory and stores the overview
/// snapshot the finance page reads first, per locale. With no backend behind
/// the repository, the page keeps showing this snapshot.
///
/// Runs once from `setUpAll`, outside fake async. Cache writes that start in
/// a widget test's fake zone are serialized and never finish once that test
/// ends, so a later seed from inside a test would wait on them forever.
Future<void> initStoreCache() async {
  if (_cacheDirectory != null) return;
  TestWidgetsFlutterBinding.ensureInitialized();
  _cacheDirectory = await Directory.systemTemp.createTemp('store-cache-');
  FlutterSecureStorage.setMockInitialValues({});
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (_) async => _cacheDirectory!.path,
      );
  await CacheStore.instance.init();
  for (final locale in StoreLocale.values) {
    await CacheStore.instance.write(
      key: CacheKey(
        namespace: 'finance.overview',
        userId: currentCacheUserId(),
        // The cache locale tag follows the host, not the listing locale, so
        // the workspace id keeps the two listings apart.
        workspaceId: StoreTeam.localeWorkspaceId(locale),
        locale: currentCacheLocaleTag(),
      ),
      policy: CachePolicies.summary,
      payload: StoreFinance(locale).overview,
      tags: const [financeOverviewCacheTag, 'module:finance'],
    );
  }
}
