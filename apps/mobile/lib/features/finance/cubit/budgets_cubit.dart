import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

enum BudgetsStatus { initial, loading, loaded, forbidden, offline, error }

class BudgetsState extends Equatable {
  const BudgetsState({
    this.status = BudgetsStatus.initial,
    this.budgets = const [],
    this.pendingIds = const {},
    this.categories = const [],
    this.wallets = const [],
    this.workspaceCurrency = '',
    this.error,
  });

  final BudgetsStatus status;
  final List<FinanceBudget> budgets;
  final Set<String> pendingIds;
  final List<TransactionCategory> categories;
  final List<Wallet> wallets;
  final String workspaceCurrency;
  final String? error;

  Iterable<FinanceBudget> activeMonthlyBudgets(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final currency = workspaceCurrency.toUpperCase();
    if (currency.isEmpty) return const [];
    final sameCurrencyWallets = {
      for (final wallet in wallets)
        if (wallet.currency?.toUpperCase() == currency) wallet.id,
    };
    // Workspace-wide budget spend sums wallet amounts on the server.
    final workspaceSpendMatchesCurrency =
        wallets.isNotEmpty && sameCurrencyWallets.length == wallets.length;
    return budgets.where((budget) {
      final walletId = budget.walletId;
      final matchesCurrency = walletId == null
          ? workspaceSpendMatchesCurrency
          : sameCurrencyWallets.contains(walletId);
      return matchesCurrency &&
          budget.period == FinanceBudgetPeriod.monthly &&
          !budget.startDate.isAfter(today) &&
          !(budget.endDate?.isBefore(today) ?? false);
    });
  }

  int countFor(FinanceBudgetHealth health) =>
      budgets.where((budget) => budget.health == health).length;

  TransactionCategory? categoryFor(String? id) =>
      id == null ? null : categories.where((c) => c.id == id).firstOrNull;
  Wallet? walletFor(String? id) =>
      id == null ? null : wallets.where((w) => w.id == id).firstOrNull;

  BudgetsState copyWith({
    BudgetsStatus? status,
    List<FinanceBudget>? budgets,
    Set<String>? pendingIds,
    List<TransactionCategory>? categories,
    List<Wallet>? wallets,
    String? workspaceCurrency,
    String? error,
  }) => BudgetsState(
    status: status ?? this.status,
    budgets: budgets ?? this.budgets,
    pendingIds: pendingIds ?? this.pendingIds,
    categories: categories ?? this.categories,
    wallets: wallets ?? this.wallets,
    workspaceCurrency: workspaceCurrency ?? this.workspaceCurrency,
    error: error,
  );

  @override
  List<Object?> get props => [
    status,
    budgets,
    pendingIds,
    categories,
    wallets,
    workspaceCurrency,
    error,
  ];
}

/// Loads workspace budgets with the categories, wallets and currency their
/// rows and forms need, and reloads after queued finance edits sync.
class BudgetsCubit extends Cubit<BudgetsState> {
  BudgetsCubit({
    required FinanceRepository repository,
    String? Function()? currentUserId,
  }) : _repo = repository,
       _currentUserId = currentUserId ?? currentCacheUserId,
       super(const BudgetsState()) {
    _repo.mutationQueue.syncRevision.addListener(_onOfflineSync);
  }

  final FinanceRepository _repo;
  final String? Function() _currentUserId;
  String? _wsId;
  String? _userId;
  int _generation = 0;

  void _onOfflineSync() {
    final wsId = _wsId;
    if (isClosed || wsId == null) return;
    unawaited(load(wsId));
  }

  Future<void> load(String wsId, {bool forceRefresh = false}) async {
    if (isClosed) return;
    final generation = ++_generation;
    final userId = _currentUserId();
    final switching = _wsId != wsId || _userId != userId;
    _userId = userId;
    _wsId = wsId;
    if (switching || state.status != BudgetsStatus.loaded) {
      emit(const BudgetsState(status: BudgetsStatus.loading));
    }
    bool current() =>
        !isClosed && generation == _generation && _currentUserId() == userId;
    try {
      final results = await Future.wait<Object>([
        _repo.getBudgets(wsId, forceRefresh: forceRefresh),
        _repo.getWorkspaceDefaultCurrency(wsId, forceRefresh: forceRefresh),
        _optional(_repo.getCategories(wsId), const <TransactionCategory>[]),
        _optional(_repo.getWallets(wsId), const <Wallet>[]),
      ]);
      if (!current()) return;
      final list = results[0] as FinanceBudgetList;
      emit(
        BudgetsState(
          status: BudgetsStatus.loaded,
          budgets: list.budgets,
          pendingIds: list.pendingIds,
          workspaceCurrency: results[1] as String,
          categories: results[2] as List<TransactionCategory>,
          wallets: results[3] as List<Wallet>,
        ),
      );
    } on ApiException catch (error) {
      if (!current()) return;
      emit(
        state.copyWith(
          status: error.statusCode == 403
              ? BudgetsStatus.forbidden
              : isOfflineTransportFailure(error)
              ? BudgetsStatus.offline
              : BudgetsStatus.error,
          error: error.message,
        ),
      );
    } on Object catch (error) {
      if (!current()) return;
      emit(
        state.copyWith(
          status: isOfflineTransportFailure(error)
              ? BudgetsStatus.offline
              : BudgetsStatus.error,
          error: '$error',
        ),
      );
    }
  }

  Future<FinanceBudgetWrite> save(
    FinanceBudget budget, {
    required bool isNew,
    required String wsId,
  }) async {
    _checkScope(wsId);
    final result = await (isNew
        ? _repo.createBudget(wsId: wsId, budget: budget)
        : _repo.updateBudget(wsId: wsId, budget: budget));
    if (_ownsScope(wsId)) await load(wsId, forceRefresh: true);
    return result;
  }

  Future<FinanceBudgetWrite> delete(
    String budgetId, {
    required String wsId,
  }) async {
    _checkScope(wsId);
    final result = await _repo.deleteBudget(wsId: wsId, budgetId: budgetId);
    if (_ownsScope(wsId)) await load(wsId, forceRefresh: true);
    return result;
  }

  bool _ownsScope(String wsId) =>
      !isClosed && _wsId == wsId && _userId == _currentUserId();

  void _checkScope(String wsId) {
    if (!_ownsScope(wsId)) {
      throw StateError('Budget workspace changed');
    }
  }

  static Future<T> _optional<T>(Future<T> future, T fallback) async {
    try {
      return await future;
    } on Object {
      return fallback;
    }
  }

  @override
  Future<void> close() {
    _generation++;
    _repo.mutationQueue.syncRevision.removeListener(_onOfflineSync);
    return super.close();
  }
}
