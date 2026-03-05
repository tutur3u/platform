import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
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
  List<Wallet> _wallets = const [];
  bool _isLoading = false;
  String? _error;
  int _currentWalletsRequestToken = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_loadWallets());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.finance);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.financeWallets),
          trailing: [
            shad.PrimaryButton(
              onPressed: _onCreate,
              child: const Icon(Icons.add, size: 16),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_loadWallets()),
        child: RefreshIndicator(
          onRefresh: _loadWallets,
          child: _isLoading
              ? const Center(child: shad.CircularProgressIndicator())
              : _error != null
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 120),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: theme.typography.textMuted,
                        ),
                      ),
                    ),
                  ],
                )
              : _wallets.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 120),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          l10n.financeNoWallets,
                          textAlign: TextAlign.center,
                          style: theme.typography.textMuted,
                        ),
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: _wallets.length,
                  separatorBuilder: (_, _) => const shad.Gap(8),
                  itemBuilder: (context, index) {
                    final wallet = _wallets[index];
                    return _WalletCard(
                      wallet: wallet,
                      onTap: () => _openWallet(wallet),
                      onEdit: () => _onEdit(wallet),
                      onDelete: () => _onDelete(wallet),
                    );
                  },
                ),
        ),
      ),
    );
  }

  Future<void> _onCreate() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final changed = await _showWalletDialog(wsId: wsId);
    if (changed) {
      await _loadWallets();
    }
  }

  Future<void> _onEdit(Wallet wallet) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final changed = await _showWalletDialog(wsId: wsId, wallet: wallet);
    if (changed) {
      await _loadWallets();
    }
  }

  Future<void> _onDelete(Wallet wallet) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final repository = context.read<FinanceRepository>();
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
          await repository.deleteWallet(wsId: wsId, walletId: wallet.id);
        },
      ),
    );

    if (!mounted || confirmed != true) return;
    await _loadWallets();
  }

  Future<void> _openWallet(Wallet wallet) async {
    await context.push(Routes.walletDetailPath(wallet.id));
    if (!mounted) return;
    await _loadWallets();
  }

  Future<void> _loadWallets() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final requestToken = ++_currentWalletsRequestToken;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final wallets = await context.read<FinanceRepository>().getWallets(wsId);
      if (!mounted || requestToken != _currentWalletsRequestToken) return;
      setState(() => _wallets = wallets);
    } on Exception {
      if (!mounted || requestToken != _currentWalletsRequestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
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
    final createdOrUpdated = await shad.showDialog<bool>(
      context: context,
      builder: (_) => WalletDialog(
        wsId: wsId,
        wallet: wallet,
        repository: context.read<FinanceRepository>(),
      ),
    );

    return createdOrUpdated ?? false;
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
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isCredit = wallet.type == 'CREDIT';
    final accent = isCredit ? Colors.deepOrange : colorScheme.primary;
    final balance = wallet.balance ?? 0;
    final currency = wallet.currency ?? 'USD';
    final icon = resolvePlatformIcon(
      wallet.icon,
      fallback: isCredit ? Icons.credit_card : Icons.wallet_outlined,
    );

    return shad.Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Row(
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
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (wallet.description?.trim().isNotEmpty ?? false) ...[
                    const shad.Gap(2),
                    Text(
                      wallet.description!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                  const shad.Gap(4),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          color: accent.withValues(alpha: 0.12),
                        ),
                        child: Text(
                          isCredit
                              ? context.l10n.financeWalletTypeCredit
                              : context.l10n.financeWalletTypeStandard,
                          style: theme.typography.xSmall.copyWith(
                            color: accent,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        formatCurrency(balance, currency),
                        style: theme.typography.xSmall.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onEdit,
              child: const Icon(Icons.edit_outlined, size: 16),
            ),
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onDelete,
              child: const Icon(Icons.delete_outline, size: 16),
            ),
          ],
        ),
      ),
    );
  }
}
