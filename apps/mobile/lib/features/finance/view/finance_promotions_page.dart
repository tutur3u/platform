import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/data/repositories/finance_promotions_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/promotion_form_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// The promotion's discount: "10%" or an amount in [currency].
String promotionValueLabel(
  BuildContext context,
  FinancePromotion promotion,
  String currency,
) {
  if (!promotion.useRatio) {
    return financeMoney(context, promotion.value, currency);
  }
  final value = promotion.value;
  final text = value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : '$value';
  return '$text%';
}

/// Invoice promotions: every code with its discount and usage. Inventory
/// permissions gate create, edit and delete because Inventory owns codes.
class FinancePromotionsPage extends StatelessWidget {
  const FinancePromotionsPage({
    this.repository,
    this.financeRepository,
    super.key,
  });

  /// Injected in tests; the page builds its own otherwise.
  final FinancePromotionsRepository? repository;
  final FinanceRepository? financeRepository;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-promotions',
          locations: const {Routes.financePromotions},
          title: context.l10n.financePromotions,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        if (workspace != null)
          _PromotionsView(
            key: ValueKey(workspace),
            workspace: workspace,
            repository: repository ?? FinancePromotionsRepository(),
            financeRepository: financeRepository ?? FinanceRepository(),
          ),
      ],
    );
  }
}

class _PromotionsView extends StatefulWidget {
  const _PromotionsView({
    required this.workspace,
    required this.repository,
    required this.financeRepository,
    super.key,
  });

  final String workspace;
  final FinancePromotionsRepository repository;
  final FinanceRepository financeRepository;

  @override
  State<_PromotionsView> createState() => _PromotionsViewState();
}

class _PromotionsViewState extends State<_PromotionsView> {
  List<FinancePromotion>? _promotions;
  String _currency = 'USD';
  FinanceProblem? _problem;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    final request = ++_request;
    try {
      final (promotions, currency) = await (
        widget.repository.list(widget.workspace, forceRefresh: force),
        widget.financeRepository.getWorkspaceDefaultCurrency(widget.workspace),
      ).wait;
      if (!mounted || request != _request) return;
      setState(() {
        _promotions = promotions;
        _currency = currency;
        _problem = null;
      });
    } on Object catch (error) {
      if (!mounted || request != _request) return;
      final failure = switch (error) {
        ParallelWaitError(errors: (final AsyncError? a, final AsyncError? b)) =>
          (a ?? b)?.error ?? error,
        _ => error,
      };
      setState(
        () => _problem = switch (failure) {
          ApiException(statusCode: 403) => FinanceProblem.forbidden,
          final Object failure when isOfflineTransportFailure(failure) =>
            FinanceProblem.offline,
          _ => FinanceProblem.error,
        },
      );
    }
  }

  Future<void> _write(Future<void> Function() action, String done) async {
    final l10n = context.l10n;
    try {
      await action();
      if (!mounted) return;
      showAppToast(context, message: done);
      await _load(force: true);
    } on ApiException catch (error) {
      if (mounted) {
        showAppToast(
          context,
          message: error.statusCode == 400 || error.statusCode == 409
              ? error.message
              : l10n.commonSomethingWentWrong,
        );
      }
    } on Object {
      if (mounted) {
        showAppToast(context, message: l10n.commonSomethingWentWrong);
      }
    }
  }

  Future<void> _open([FinancePromotion? promotion]) async {
    final l10n = context.l10n;
    final result = await showPromotionFormSheet(
      context,
      currency: _currency,
      promotion: promotion,
      canDelete: canManageFinance(context, 'delete_inventory', listen: false),
    );
    if (!mounted) return;
    final ws = widget.workspace;
    switch (result) {
      case null:
        return;
      case PromotionSave(:final promotion):
        await _write(
          () => promotion.id.isEmpty
              ? widget.repository.create(ws, promotion)
              : widget.repository.update(ws, promotion),
          l10n.financePromotionSaved,
        );
      case PromotionDelete():
        final existing = promotion;
        if (existing == null) return;
        final confirmed = await showAppConfirmDialog(
          context: context,
          title: l10n.financePromotionDeleteTitle(existing.name),
          message: l10n.financePromotionDeleteBody,
          confirmLabel: l10n.commonDelete,
          cancelLabel: l10n.commonCancel,
          destructive: true,
        );
        if (!confirmed || !mounted) return;
        await _write(
          () => widget.repository.delete(ws, existing.id),
          l10n.financePromotionDeleted,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canCreate = canManageFinance(context, 'create_inventory');
    final canUpdate = canManageFinance(context, 'update_inventory');
    final promotions = _promotions;
    final problem = _problem;
    final Widget body;
    if (promotions == null && problem != null) {
      body = FinanceProblemView(
        problem: problem,
        onRetry: problem == FinanceProblem.forbidden
            ? null
            : () => unawaited(_load(force: true)),
      );
    } else if (promotions == null) {
      body = const FinanceListSkeleton();
    } else if (promotions.isEmpty) {
      body = AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: AppSpacing.xxxl),
          AppStateMessage(
            icon: LucideIcons.ticketPercent,
            title: l10n.financePromotionsEmpty,
            message: l10n.financePromotionsEmptyBody,
            actionLabel: canCreate ? l10n.financePromotionNew : null,
            onAction: canCreate ? () => unawaited(_open()) : null,
          ),
        ],
      );
    } else {
      body = AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          AppGroupedCard(
            children: [
              for (final promotion in promotions)
                _PromotionRow(
                  key: ValueKey(promotion.id),
                  promotion: promotion,
                  currency: _currency,
                  onTap: canUpdate ? () => unawaited(_open(promotion)) : null,
                ),
            ],
          ),
        ],
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellChromeActions(
          ownerId: 'finance-promotions',
          locations: const {Routes.financePromotions},
          actions: [
            financeAmountVisibilityAction(
              context,
              showAmounts: financeAmountsVisible(context),
              id: 'finance-promotions-amount-visibility',
            ),
            if (canCreate)
              financeCreateAction(
                id: 'finance-promotion-create',
                tooltip: l10n.financePromotionNew,
                onPressed: promotions == null ? null : () => unawaited(_open()),
              ),
          ],
        ),
        NovaRefreshIndicator(onRefresh: () => _load(force: true), child: body),
      ],
    );
  }
}

class _PromotionRow extends StatelessWidget {
  const _PromotionRow({
    required this.promotion,
    required this.currency,
    this.onTap,
    super.key,
  });

  final FinancePromotion promotion;
  final String currency;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final max = promotion.maxUses;
    return AppRichRow(
      title: promotion.name,
      subtitle: promotion.code,
      leading: AppIconTile(
        icon: LucideIcons.ticketPercent,
        tone: promotion.usedUp ? AppTone.neutral : AppTone.primary,
      ),
      meta: [
        AppMetaItem(
          icon: LucideIcons.users,
          label: max == null
              ? l10n.financePromotionUsesUnlimited(promotion.currentUses)
              : l10n.financePromotionUses(promotion.currentUses, max),
        ),
        if (max != null)
          SizedBox(
            width: 96,
            child: AppMeter(
              value: (promotion.currentUses / max).clamp(0.0, 1.0),
              tone: promotion.usedUp ? AppTone.warning : AppTone.primary,
            ),
          ),
      ],
      trailing: promotion.useRatio
          ? Text(promotionValueLabel(context, promotion, currency))
          : FinanceAmountText(promotion.value, currency),
      trailingCaption: promotion.usedUp ? l10n.financePromotionUsedUp : null,
      onTap: onTap,
    );
  }
}
