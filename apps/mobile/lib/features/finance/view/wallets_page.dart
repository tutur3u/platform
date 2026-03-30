import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletsPage extends StatelessWidget {
  const WalletsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
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
  static const double _fabContentBottomPadding = 96;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'finance:wallets';
  static final Map<String, _WalletsCacheEntry> _cache = {};

  List<Wallet> _wallets = const [];
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

  CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'finance.wallets',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

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
    if (!cached.hasValue || cached.data == null) {
      return;
    }

    setState(() {
      _wallets = cached.data!;
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final listBottomPadding =
        _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          _seedWalletsFromCacheIfNeeded(
            wsId: state.currentWorkspace?.id,
          );
          unawaited(_loadWallets());
        },
        child: Stack(
          children: [
            RefreshIndicator(
              onRefresh: () => _loadWallets(forceRefresh: true),
              child: _buildBody(listBottomPadding),
            ),
            ExtendedFab(
              icon: Icons.add,
              label: l10n.financeCreateWallet,
              onPressed: _onCreate,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(double listBottomPadding) {
    final l10n = context.l10n;

    if (_isLoading) {
      return const Center(child: NovaLoadingIndicator());
    }

    if (_error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
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

    if (_wallets.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
        children: [
          _WalletSummaryCard(walletCount: 0, onCreate: _onCreate),
          const shad.Gap(16),
          FinanceEmptyState(
            icon: Icons.account_balance_wallet_outlined,
            title: l10n.financeNoWallets,
            body: l10n.financeOverviewNoWalletsBody,
            action: shad.SecondaryButton(
              onPressed: _onCreate,
              child: Text(l10n.financeCreateFirstWallet),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
      itemCount: _wallets.length + 1,
      separatorBuilder: (context, index) => const shad.Gap(12),
      itemBuilder: (context, index) {
        if (index == 0) {
          return _WalletSummaryCard(
            walletCount: _wallets.length,
            onCreate: _onCreate,
          );
        }

        final wallet = _wallets[index - 1];
        return _WalletCard(
          wallet: wallet,
          onTap: () => _openWallet(wallet),
          onEdit: () => _onEdit(wallet),
          onDelete: () => _onDelete(wallet),
        );
      },
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
        _loadedWorkspaceId = null;
        _seededWorkspaceId = null;
        _isLoading = false;
        _error = null;
      });
      return;
    }
    final requestToken = ++_currentWalletsRequestToken;
    final cached = _cache[wsId];
    final diskCached = await CacheStore.instance.read<List<Wallet>>(
      key: _cacheKey(wsId),
      decode: _decodeWallets,
    );
    final resolvedWallets = cached?.wallets ?? diskCached.data;
    final hasVisibleData = _loadedWorkspaceId == wsId;

    if (!forceRefresh && resolvedWallets != null) {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      setState(() {
        _wallets = resolvedWallets;
        _loadedWorkspaceId = wsId;
        _isLoading = false;
        _error = null;
      });
      if ((cached != null && isFinanceCacheFresh(cached.fetchedAt)) ||
          diskCached.isFresh) {
        return;
      }
    } else if (!hasVisibleData) {
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      setState(() {
        _wallets = const [];
        _loadedWorkspaceId = wsId;
        _isLoading = true;
        _error = null;
      });
    } else {
      setState(() => _error = null);
    }

    try {
      final wallets = await repository.getWallets(wsId);
      if (!mounted || requestToken != _currentWalletsRequestToken) {
        return;
      }
      _cache[wsId] = _WalletsCacheEntry(
        wallets: wallets,
        fetchedAt: DateTime.now(),
      );
      await CacheStore.instance.write(
        key: _cacheKey(wsId),
        policy: _cachePolicy,
        payload: wallets
            .map((wallet) => wallet.toJson())
            .toList(growable: false),
        tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      );
      setState(() {
        _wallets = wallets;
        _loadedWorkspaceId = wsId;
        _error = null;
      });
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

  Future<bool> _showWalletDialog({
    required String wsId,
    Wallet? wallet,
  }) async {
    final result = await showFinanceModal<bool>(
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
  const _WalletsCacheEntry({
    required this.wallets,
    required this.fetchedAt,
  });

  final List<Wallet> wallets;
  final DateTime fetchedAt;
}

class _WalletSummaryCard extends StatelessWidget {
  const _WalletSummaryCard({
    required this.walletCount,
    required this.onCreate,
  });

  final int walletCount;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final palette = FinancePalette.of(context);

    return FinancePanel(
      padding: const EdgeInsets.all(20),
      backgroundColor: palette.elevatedPanel,
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: palette.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              Icons.account_balance_wallet_outlined,
              color: palette.accent,
            ),
          ),
          const shad.Gap(14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FinanceSectionHeader(
                  title: l10n.financeOverviewWalletSectionTitle,
                  subtitle: l10n.financeWalletSummaryHint(walletCount),
                  action: shad.GhostButton(
                    density: shad.ButtonDensity.icon,
                    onPressed: onCreate,
                    child: const Icon(Icons.add_card_rounded, size: 18),
                  ),
                ),
              ],
            ),
          ),
          FinanceStatChip(
            icon: Icons.layers_outlined,
            label: l10n.financeWallets,
            value: '$walletCount',
          ),
        ],
      ),
    );
  }
}

class _WalletCard extends StatelessWidget {
  const _WalletCard({
    required this.wallet,
    required this.onTap,
    required this.onEdit,
    required this.onDelete,
  });

  final Wallet wallet;
  final VoidCallback onTap;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final isCredit = wallet.type == 'CREDIT';
    final accent = isCredit ? palette.negative : palette.accent;
    final balance = wallet.balance ?? 0;
    final currency = wallet.currency ?? 'USD';
    final icon = resolvePlatformIcon(
      wallet.icon,
      fallback: isCredit ? Icons.credit_card_outlined : Icons.wallet_outlined,
    );

    return FinancePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              WalletVisualAvatar(
                icon: wallet.icon,
                imageSrc: wallet.imageSrc,
                fallbackIcon: icon,
                backgroundColor: accent.withValues(alpha: 0.14),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      wallet.name ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (wallet.description?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        wallet.description!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(8),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onEdit,
                child: const Icon(Icons.edit_outlined, size: 18),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onDelete,
                child: const Icon(Icons.delete_outline, size: 18),
              ),
            ],
          ),
          const shad.Gap(18),
          FinanceAmountText(
            amount: balance,
            currency: currency,
            showPlus: false,
            alignment: CrossAxisAlignment.start,
            forceColor: theme.colorScheme.foreground,
            style: theme.typography.h3,
          ),
          const shad.Gap(12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _WalletMetaPill(
                label: isCredit
                    ? context.l10n.financeWalletTypeCredit
                    : context.l10n.financeWalletTypeStandard,
                color: accent,
              ),
              _WalletMetaPill(
                label: currency.toUpperCase(),
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WalletMetaPill extends StatelessWidget {
  const _WalletMetaPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: shad.Theme.of(context).typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
