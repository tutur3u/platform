import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scales.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_tone.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'finance_overview_rows.dart';
part 'finance_overview_sections.dart';
part 'finance_page_hero.dart';

class FinanceOverviewSkeleton extends StatelessWidget {
  const FinanceOverviewSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const AppPageListView(
    children: [
      FinanceSkeletonBlock(height: 180, radius: 24),
      SizedBox(height: AppSpacing.lg),
      FinanceSkeletonBlock(height: 96, radius: 20),
      SizedBox(height: AppLayout.itemGap),
      FinanceSkeletonBlock(height: 96, radius: 20),
      SizedBox(height: AppSpacing.xl),
      FinanceSkeletonBlock(height: 56, radius: 18),
    ],
  );
}

Future<void> _reload(BuildContext context, {bool retainError = false}) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    await context.read<FinanceCubit>().loadFinanceData(
      wsId,
      forceRefresh: true,
      retainError: retainError,
    );
  }
}

class FinancePage extends StatelessWidget {
  const FinancePage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = FinanceCubit(
            financeRepository: context.read<FinanceRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) {
            unawaited(cubit.loadFinanceData(wsId));
          }
          unawaited(CacheWarmupCoordinator.instance.prewarmModule('finance'));
          return cubit;
        },
        child: const _FinanceView(),
      ),
    );
  }
}

class _FinanceView extends StatelessWidget {
  const _FinanceView();

  @override
  Widget build(BuildContext context) {
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<FinanceCubit>().loadFinanceData(wsId));
          }
        },
        child: BlocBuilder<FinanceCubit, FinanceState>(
          builder: (context, state) {
            if (state.status == FinanceStatus.loading) {
              return const FinanceOverviewSkeleton();
            }

            if (state.status == FinanceStatus.error) {
              return NovaRefreshIndicator.state(
                onRefresh: () => _reload(context, retainError: true),
                child: _FinanceError(error: state.error),
              );
            }

            if (!state.hasWorkspaceCurrency) {
              return const FinanceOverviewSkeleton();
            }

            return Stack(
              children: [
                ShellChromeActions(
                  ownerId: 'finance-overview',
                  locations: const {Routes.finance},
                  actions: [
                    financeAmountVisibilityAction(
                      context,
                      showAmounts: showAmounts,
                    ),
                    ShellActionSpec(
                      id: 'finance-search',
                      icon: Icons.search,
                      tooltip: context.l10n.commonSearch,
                      onPressed: () =>
                          context.push('${Routes.transactions}?search=1'),
                    ),
                    ShellActionSpec(
                      id: 'finance-create',
                      icon: Icons.add,
                      tooltip: context.l10n.financeNewTransaction,
                      filled: true,
                      onPressed: () => unawaited(_create(context, state)),
                    ),
                  ],
                ),
                NovaRefreshIndicator(
                  onRefresh: () => _reload(context, retainError: true),
                  child: FinanceOverviewContent(
                    state: state,
                    showAmounts: showAmounts,
                    onTransactionTap: (transaction) =>
                        _openTransaction(context, state, transaction),
                    onCreate: () => _create(context, state),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

Future<void> _create(BuildContext context, FinanceState state) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId == null) return;
  final created = await openCreateTransactionSheet(
    context,
    wsId: wsId,
    repository: context.read<FinanceRepository>(),
    exchangeRates: state.exchangeRates,
  );
  if (!created || !context.mounted) return;
  showAppToast(context, message: context.l10n.financeTransactionSaved);
  await _reload(context, retainError: true);
}

Future<void> _openTransaction(
  BuildContext context,
  FinanceState state,
  Transaction transaction,
) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId == null) return;
  await openTransactionDetailSheet(
    context,
    wsId: wsId,
    transaction: transaction,
    repository: context.read<FinanceRepository>(),
    workspaceCurrency: state.workspaceCurrency,
    exchangeRates: state.exchangeRates,
  );
  if (context.mounted) await _reload(context);
}

class _FinanceError extends StatelessWidget {
  const _FinanceError({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AppPageBody(
      child: Center(
        child: FinanceEmptyState(
          icon: Icons.error_outline,
          title: l10n.commonSomethingWentWrong,
          body: error ?? l10n.financeTitle,
          action: shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}
