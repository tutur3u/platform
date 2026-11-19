import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_pending_overlay.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/utils/wallet_ordering.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart' as money;
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'wallets_card.dart';

class WalletsPage extends StatelessWidget {
  const WalletsPage({this.repository, super.key});

  final FinanceRepository? repository;

  static void clearCache() {
    _WalletsViewState.clearMemoryCache();
  }

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
      child: const _WalletsView(),
    );
  }
}

class _WalletsView extends StatefulWidget {
  const _WalletsView();

  @override
  State<_WalletsView> createState() => _WalletsViewState();
}

class _WalletsViewState extends State<_WalletsView> {
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'finance:wallets';
  static final Map<String, _WalletsCacheEntry> _cache = {};

  static void clearMemoryCache() {
    _cache.clear();
  }

  final _searchController = TextEditingController();
  bool _isSearchVisible = false;
  List<Wallet> _wallets = const [];
  String? _workspaceCurrency;
  bool _isLoading = false;
  String? _error;
  int _currentWalletsRequestToken = 0;
  String? _loadedWorkspaceId;
  String? _seededWorkspaceId;

  @override
  void initState() {
    super.initState();
    unawaited(_loadWallets());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _seedWalletsFromCacheIfNeeded();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _closeSearch() {
    _searchController.clear();
    setState(() => _isSearchVisible = false);
  }

  CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'finance.wallets',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  String _memoryCacheKey(String wsId) => userScopedCacheKey(wsId);

  void _seedWalletsFromCacheIfNeeded({String? wsId}) {
    final resolvedWsId =
        wsId ?? context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (_seededWorkspaceId == resolvedWsId) {
      return;
    }
    _seededWorkspaceId = resolvedWsId;

    if (!mounted || resolvedWsId == null) {
      return;
    }

    final cached = CacheStore.instance.peek<List<Wallet>>(
      key: _cacheKey(resolvedWsId),
      decode: _decodeWallets,
    );
    final cachedCurrency = context
        .read<FinanceRepository>()
        .peekWorkspaceDefaultCurrency(resolvedWsId);
    if (!cached.hasValue || cached.data == null) {
      if (cachedCurrency != null && mounted) {
        setState(() => _workspaceCurrency = cachedCurrency);
      }
      return;
    }

    setState(() {
      _workspaceCurrency = cachedCurrency;
      _wallets = _sortWallets(cached.data!, workspaceCurrency: cachedCurrency);
      _loadedWorkspaceId = resolvedWsId;
      _isLoading = false;
      _error = null;
    });
  }

  List<Wallet> _decodeWallets(Object? json) {
    if (json is! List) {
      throw const FormatException('Invalid wallets cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(Wallet.fromJson)
        .toList(growable: false);
  }

  List<Wallet> _sortWallets(
    List<Wallet> wallets, {
    required String? workspaceCurrency,
  }) {
    if (workspaceCurrency == null || workspaceCurrency.trim().isEmpty) {
      return wallets;
    }
    return sortWalletsForDisplay(
      wallets: wallets,
      workspaceCurrency: workspaceCurrency,
      exchangeRates: const <ExchangeRate>[],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          setState(() {
            _wallets = const [];
            _workspaceCurrency = null;
            _error = null;
            _isLoading = state.currentWorkspace != null;
          });
          _seedWalletsFromCacheIfNeeded(wsId: state.currentWorkspace?.id);
          unawaited(_loadWallets());
        },
        child: Stack(
          children: [
            NovaRefreshIndicator(
              onRefresh: () => _loadWallets(forceRefresh: true),
              child: LayoutBuilder(
                builder: (context, constraints) => ValueListenableBuilder(
                  valueListenable: OfflineMutationQueue.instance.pending,
                  builder: (context, records, _) => _buildBody(
                    AppPageInsets.of(context, width: constraints.maxWidth),
                    showAmounts: showAmounts,
                    wallets: overlayPendingWallets(
                      context
                              .read<WorkspaceCubit>()
                              .state
                              .currentWorkspace
                              ?.id ??
                          '',
                      _wallets,
                      records,
                    ),
                  ),
                ),
              ),
            ),
            ShellTitleOverride(
              ownerId: 'finance-wallets',
              locations: const {Routes.wallets},
              title: l10n.financeWallets,
              showLeadingBrand: false,
              showAvatar: false,
            ),
            ShellChromeActions(
              ownerId: 'finance-wallets',
              locations: const {Routes.wallets},
              actions: [
                financeSearchAction(
                  id: 'finance-wallet-search',
                  active: _isSearchVisible,
                  hint: l10n.financeSearchWallets,
                  controller: _searchController,
                  onChanged: (_) => setState(() {}),
                  hasQuery: _searchController.text.trim().isNotEmpty,
                  onOpen: () => setState(() => _isSearchVisible = true),
                  onClose: _closeSearch,
                ),
                financeAmountVisibilityAction(
                  context,
                  showAmounts: showAmounts,
                ),
                if (canManageFinance(context, 'create_wallets'))
                  financeCreateAction(
                    id: 'finance-create-wallet',
                    tooltip: l10n.financeCreateWallet,
                    onPressed: _onCreate,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
    EdgeInsets pagePadding, {
    required bool showAmounts,
    required List<Wallet> wallets,
  }) {
    final l10n = context.l10n;

    if (_isLoading && wallets.isEmpty) {
      return const FinanceListSkeleton();
    }

    if (wallets.isNotEmpty &&
        (_workspaceCurrency == null || _workspaceCurrency!.trim().isEmpty)) {
      return ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        itemCount: wallets.length.clamp(1, 4),
        separatorBuilder: (context, index) => const shad.Gap(AppLayout.itemGap),
        itemBuilder: (context, index) => const _WalletCardSkeleton(),
      );
    }

    if (_error != null && wallets.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.error_outline,
            title: l10n.commonSomethingWentWrong,
            body: _error!,
            action: shad.SecondaryButton(
              onPressed: _loadWallets,
              child: Text(l10n.commonRetry),
            ),
          ),
        ],
      );
    }

    if (wallets.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.account_balance_wallet_outlined,
            title: l10n.financeNoWallets,
            body: l10n.financeOverviewNoWalletsBody,
            action: canManageFinance(context, 'create_wallets')
                ? shad.SecondaryButton(
                    onPressed: _onCreate,
                    child: Text(l10n.financeCreateFirstWallet),
                  )
                : null,
          ),
        ],
      );
    }

    final search = _searchController.text.trim().toLowerCase();
    final visibleWallets = search.isEmpty
        ? wallets
        : wallets
              .where((wallet) {
                return [
                  wallet.name,
                  wallet.description,
                  wallet.currency,
                ].nonNulls.any((value) => value.toLowerCase().contains(search));
              })
              .toList(growable: false);
    if (visibleWallets.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          AppStateMessage(
            icon: Icons.search_off_outlined,
            illustration: const AppIllustration(
              AppIllustrationKind.searchNoResults,
            ),
            title: l10n.financeWalletSearchEmpty,
            actionLabel: l10n.financeActivityClearSearch,
            onAction: _closeSearch,
          ),
        ],
      );
    }

    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: pagePadding,
      children: [
        AppGroupedCard(
          dividerInset: 64,
          children: [
            for (final wallet in visibleWallets)
              PendingSyncFrame(
                workspaceId: wsId,
                entityId: wallet.id,
                feature: 'finance',
                child: _WalletRow(
                  wallet: wallet,
                  currency: wallet.currency ?? _workspaceCurrency!,
                  showAmounts: showAmounts,
                  onTap: () => _openWallet(wallet),
                  onEdit: canManageFinance(context, 'update_wallets')
                      ? () => _onEdit(wallet)
                      : null,
                  onDelete: canManageFinance(context, 'delete_wallets')
                      ? () => _onDelete(wallet)
                      : null,
                ),
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _onCreate() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final changed = await _showWalletDialog(wsId: wsId);
    if (changed) {
      await _loadWallets(forceRefresh: true);
    }
  }

  Future<void> _onEdit(Wallet wallet) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final changed = await _showWalletDialog(wsId: wsId, wallet: wallet);
    if (changed) {
      await _loadWallets(forceRefresh: true);
    }
  }

  Future<void> _onDelete(Wallet wallet) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final l10n = context.l10n;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final confirmed = await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        title: l10n.financeDeleteWallet,
        message: l10n.financeDeleteWalletConfirm,
        cancelLabel: l10n.commonCancel,
        confirmLabel: l10n.financeDeleteWallet,
        toastContext: toastContext,
        onConfirm: () async {
          await context.read<FinanceRepository>().deleteWallet(
            wsId: wsId,
            walletId: wallet.id,
          );
        },
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    await _loadWallets(forceRefresh: true);
  }

  Future<void> _openWallet(Wallet wallet) async {
    await context.push(Routes.walletDetailPath(wallet.id));
    if (mounted) {
      await _loadWallets(forceRefresh: true);
    }
  }

  Future<void> _loadWallets({bool forceRefresh = false}) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final repository = context.read<FinanceRepository>();
    if (wsId == null) {
      if (!mounted) {
        _loadedWorkspaceId = null;
        _seededWorkspaceId = null;
        return;
      }
      setState(() {
        _wallets = const [];
        _workspaceCurrency = null;
        _loadedWorkspaceId = null;
        _seededWorkspaceId = null;
        _isLoading = false;
        _error = null;
      });
      return;
    }
    final requestToken = ++_currentWalletsRequestToken;
    final cached = _cache[_memoryCacheKey(wsId)];
    final diskCached = await CacheStore.instance.read<List<Wallet>>(
      key: _cacheKey(wsId),
      decode: _decodeWallets,
    );
    final resolvedWallets = cached?.wallets ?? diskCached.data;
    final hasVisibleData = _loadedWorkspaceId == wsId;
    final cachedCurrency = await repository
        .readWorkspaceDefaultCurrencyFromCache(wsId);

    if (!forceRefresh && resolvedWallets != null) {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      setState(() {
        _wallets = _sortWallets(
          resolvedWallets,
          workspaceCurrency: cachedCurrency,
        );
        _workspaceCurrency = cachedCurrency;
        _loadedWorkspaceId = wsId;
        _isLoading = false;
        _error = null;
      });
    } else if (!hasVisibleData) {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      setState(() {
        _wallets = const [];
        _workspaceCurrency = cachedCurrency;
        _loadedWorkspaceId = wsId;
        _isLoading = true;
        _error = null;
      });
    } else {
      setState(() => _error = null);
    }

    try {
      final results = await Future.wait<dynamic>([
        CacheStore.awaitRevalidation(() => repository.getWallets(wsId)),
        CacheStore.awaitRevalidation(
          () => repository.getWorkspaceDefaultCurrency(
            wsId,
            forceRefresh: forceRefresh,
          ),
        ),
      ]);
      final wallets = results[0] as List<Wallet>;
      final workspaceCurrency = results[1] as String;
      final sortedWallets = sortWalletsForDisplay(
        wallets: wallets,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: const [],
      );
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      _cache[_memoryCacheKey(wsId)] = _WalletsCacheEntry(
        wallets: sortedWallets,
        fetchedAt: DateTime.now(),
      );
      await CacheStore.instance.write(
        key: _cacheKey(wsId),
        policy: _cachePolicy,
        payload: sortedWallets
            .map((wallet) => wallet.toJson())
            .toList(growable: false),
        tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      );
      if (!mounted || requestToken != _currentWalletsRequestToken) return;
      setState(() {
        _wallets = sortedWallets;
        _workspaceCurrency = workspaceCurrency;
        _loadedWorkspaceId = wsId;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      if (resolvedWallets != null || hasVisibleData) {
        setState(() => _error = null);
      } else {
        final message = error.message.trim();
        setState(
          () => _error = message.isEmpty || message == 'Request failed'
              ? context.l10n.commonSomethingWentWrong
              : message,
        );
      }
    } on Exception {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      if (resolvedWallets != null || hasVisibleData) {
        setState(() => _error = null);
      } else {
        setState(() => _error = context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted && requestToken == _currentWalletsRequestToken) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<bool> _showWalletDialog({required String wsId, Wallet? wallet}) async {
    final result = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => WalletDialog(
        wsId: wsId,
        wallet: wallet,
        repository: context.read<FinanceRepository>(),
      ),
    );

    return result ?? false;
  }
}

class _WalletsCacheEntry {
  const _WalletsCacheEntry({required this.wallets, required this.fetchedAt});

  final List<Wallet> wallets;
  final DateTime fetchedAt;
}

class _WalletCardSkeleton extends StatelessWidget {
  const _WalletCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return const FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              FinanceSkeletonBlock(width: 44, height: 44, radius: 16),
              shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FinanceSkeletonBlock(width: 148, height: 18),
                    shad.Gap(8),
                    FinanceSkeletonBlock(width: 196, height: 12, radius: 10),
                  ],
                ),
              ),
            ],
          ),
          shad.Gap(18),
          FinanceSkeletonBlock(width: 176, height: 30, radius: 14),
          shad.Gap(12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceSkeletonBlock(width: 82, height: 28, radius: 999),
              FinanceSkeletonBlock(width: 70, height: 28, radius: 999),
            ],
          ),
        ],
      ),
    );
  }
}
