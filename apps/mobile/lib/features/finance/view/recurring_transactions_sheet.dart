import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/recurring_transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/recurring_transaction_form.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> openRecurringTransactionsSheet(
  BuildContext context, {
  required String currency,
}) async {
  final workspace = context.read<WorkspaceCubit>();
  final actor = context.read<AuthCubit?>();
  final wsId = workspace.state.currentWorkspace?.id;
  if (wsId == null) return;
  final repository = context.read<FinanceRepository>();
  final preferences = context.read<FinancePreferencesCubit?>();
  await showAppSheet<void>(
    context: context,
    size: AppSheetSize.large,
    builder: (_) {
      final content = _RecurringTransactionsSheet(
        wsId: wsId,
        currency: currency,
        repository: repository,
        workspace: workspace,
        actor: actor,
        canManage: () =>
            context.mounted &&
            canManageFinance(context, 'manage_finance', listen: false),
      );
      return preferences == null
          ? content
          : BlocProvider.value(value: preferences, child: content);
    },
  );
}

class _RecurringTransactionsSheet extends StatefulWidget {
  const _RecurringTransactionsSheet({
    required this.wsId,
    required this.currency,
    required this.repository,
    required this.workspace,
    required this.actor,
    required this.canManage,
  });

  final String wsId;
  final String currency;
  final FinanceRepository repository;
  final WorkspaceCubit workspace;
  final AuthCubit? actor;
  final bool Function() canManage;

  @override
  State<_RecurringTransactionsSheet> createState() =>
      _RecurringTransactionsSheetState();
}

class _RecurringTransactionsSheetState
    extends State<_RecurringTransactionsSheet> {
  late final String? _actorId = widget.actor?.state.user?.id;
  late final StreamSubscription<String?> _workspaceSubscription;
  StreamSubscription<String?>? _actorSubscription;
  List<RecurringTransaction>? _rules;
  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  bool _invalidated = false;
  bool _failed = false;
  bool _busy = false;
  int _request = 0;
  AppToastHandle? _toast;

  bool get _active =>
      mounted &&
      !_invalidated &&
      widget.actor?.state.user?.id == _actorId &&
      widget.workspace.state.currentWorkspace?.id == widget.wsId;

  void _invalidate() {
    if (!mounted || _invalidated) return;
    _toast?.close();
    setState(() {
      _invalidated = true;
      _rules = null;
      _wallets = const [];
      _categories = const [];
    });
  }

  @override
  void initState() {
    super.initState();
    _workspaceSubscription = widget.workspace.stream
        .map((state) => state.currentWorkspace?.id)
        .listen((id) {
          if (id != widget.wsId) _invalidate();
        });
    final actorId = _actorId;
    _actorSubscription = widget.actor?.stream
        .map((state) => state.user?.id)
        .listen((id) {
          if (id != actorId) _invalidate();
        });
    unawaited(_load());
  }

  @override
  void dispose() {
    _toast?.close();
    unawaited(_workspaceSubscription.cancel());
    unawaited(_actorSubscription?.cancel());
    super.dispose();
  }

  Future<void> _load({bool force = false}) async {
    if (!_active) return;
    final request = ++_request;
    final repo = widget.repository;
    final wsId = widget.wsId;
    try {
      final (rules, wallets, categories) = await (
        CacheStore.readWithRevalidation(
          () => _active
              ? repo.getRecurringTransactions(wsId, forceRefresh: force)
              : Future.value(<RecurringTransaction>[]),
          onSnapshot: (rules) {
            if (_active && request == _request) {
              setState(() => _rules = rules);
            }
          },
        ),
        repo.getWallets(wsId).catchError((_) => const <Wallet>[]),
        repo
            .getCategories(wsId)
            .catchError((_) => const <TransactionCategory>[]),
      ).wait;
      if (!_active || request != _request) return;
      setState(() {
        _rules = rules;
        _wallets = wallets;
        _categories = categories;
        _failed = false;
      });
    } on Object {
      if (_active && request == _request) setState(() => _failed = true);
    }
  }

  Future<void> _mutate(Future<void> Function() operation) async {
    if (!_active || _busy || !widget.canManage()) return;
    _toast?.close();
    setState(() => _busy = true);
    try {
      await operation();
    } on Object {
      if (mounted && _active) {
        _toast = showAppToast(
          context,
          message: context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (_active) setState(() => _busy = false);
    }
  }

  Future<void> _edit({
    required bool showAmounts,
    RecurringTransaction? record,
  }) => _mutate(() async {
    final draft = await showAppSheet<RecurringTransactionDraft>(
      context: context,
      size: AppSheetSize.large,
      builder: (_) => RecurringTransactionForm(
        wallets: _wallets,
        categories: _categories,
        showAmounts: showAmounts,
        record: record,
      ),
    );
    if (draft == null || !_active || !widget.canManage()) return;
    await widget.repository.saveRecurringTransaction(
      workspace: widget.wsId,
      draft: draft,
      id: record?.id,
    );
    await _load(force: true);
  });

  Future<void> _openRule(
    RecurringTransaction rule, {
    required bool showAmounts,
  }) async {
    if (!_active || _busy) return;
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final details = await showAppActionSheet<_RuleAction>(
      context: context,
      title: rule.draft.name,
      description: [
        recurringFrequencyLabel(l10n, rule.draft.frequency),
        l10n.financeRecurringStartDate(
          dates.formatShortDate(rule.draft.startDate),
        ),
        if (rule.draft.endDate case final end?)
          l10n.financeRecurringEndDate(dates.formatShortDate(end)),
        if (rule.draft.description case final description?) description,
      ].join('\n'),
      actions: [
        if (widget.canManage()) ...[
          AppSheetAction(
            label: l10n.commonEdit,
            icon: LucideIcons.pencil,
            value: _RuleAction.edit,
          ),
          AppSheetAction(
            label: l10n.commonDelete,
            icon: LucideIcons.trash2,
            destructive: true,
            value: _RuleAction.delete,
          ),
        ],
      ],
    );
    if (!mounted || !_active) return;
    switch (details) {
      case _RuleAction.edit:
        await _edit(showAmounts: showAmounts, record: rule);
      case _RuleAction.delete:
        await _delete(rule);
      case null:
        break;
    }
  }

  Future<void> _delete(RecurringTransaction rule) => _mutate(() async {
    final l10n = context.l10n;
    final confirmed = await showAppActionSheet<bool>(
      context: context,
      title: l10n.financeRecurringDelete,
      description: rule.draft.name,
      actions: [
        AppSheetAction(
          label: l10n.commonDelete,
          icon: LucideIcons.trash2,
          destructive: true,
          value: true,
        ),
      ],
    );
    if (confirmed != true || !_active || !widget.canManage()) return;
    await widget.repository.deleteRecurringTransaction(
      workspace: widget.wsId,
      id: rule.id,
    );
    await _load(force: true);
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final visible = financeAmountsVisible(context);
    final rules = _rules;
    final walletById = {for (final wallet in _wallets) wallet.id: wallet};
    final canCreate = _active && widget.canManage() && _wallets.isNotEmpty;
    return AppSheetScaffold(
      title: l10n.financeRecurring,
      onRefresh: _active ? () => _load(force: true) : null,
      actions: [
        if (canCreate)
          AppButton.primary(
            leading: const Icon(LucideIcons.plus),
            onPressed: _busy
                ? null
                : () => unawaited(_edit(showAmounts: visible)),
            child: Text(l10n.financeRecurringNew),
          ),
      ],
      slivers: [
        if (_invalidated || _failed)
          SliverToBoxAdapter(
            child: AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              tone: AppTone.destructive,
              actionLabel: _active ? l10n.commonRetry : null,
              onAction: _active ? () => unawaited(_load(force: true)) : null,
            ),
          ),
        if (rules == null && !_failed && !_invalidated)
          const SliverToBoxAdapter(child: AppSkeletonRows())
        else if (rules != null && rules.isEmpty)
          SliverToBoxAdapter(
            child: AppStateMessage.inline(
              icon: LucideIcons.repeat,
              title: l10n.financeRecurringEmpty,
            ),
          )
        else if (rules != null)
          SliverList.builder(
            itemCount: rules.length,
            itemBuilder: (context, index) {
              final rule = rules[index];
              final wallet = walletById[rule.draft.walletId];
              return AppRichRow(
                key: ValueKey(rule.id),
                leading: const AppIconTile(icon: LucideIcons.repeat),
                title: rule.draft.name,
                subtitle: [
                  recurringFrequencyLabel(l10n, rule.draft.frequency),
                  if (wallet?.name case final name?) name,
                ].join(' · '),
                trailing: wallet == null
                    ? null
                    : FinanceAmountText(
                        rule.draft.amount,
                        wallet.currency ?? widget.currency,
                        signed: true,
                      ),
                meta: [
                  AppMetaItem(
                    label: rule.active
                        ? l10n.financeRecurringNext(
                            dates.formatShortDate(rule.nextOccurrence),
                          )
                        : l10n.financeRecurringInactive,
                  ),
                ],
                onTap: () => unawaited(_openRule(rule, showAmounts: visible)),
              );
            },
          ),
      ],
    );
  }
}

enum _RuleAction { edit, delete }
