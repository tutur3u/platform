import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

enum WalletCreditAction { charge, payment, refund }

Future<WalletCreditAction?> showWalletCredit(
  BuildContext context, {
  required String walletId,
  required String currency,
}) {
  final repository = context.read<FinanceRepository>();
  final session = FinanceSheetSession(context);
  return session.runForResult<WalletCreditAction>(
    (context) => _WalletCreditSheet(
      load: () =>
          repository.getWalletCreditSummary(session.workspaceId, walletId),
      currency: currency,
      onAction: session.allows('create_transactions')
          ? (action) {
              if (!session.allows('create_transactions')) return;
              Navigator.of(context).pop(action);
            }
          : null,
    ),
  );
}

class _WalletCreditSheet extends StatefulWidget {
  const _WalletCreditSheet({
    required this.load,
    required this.currency,
    required this.onAction,
  });

  final Future<WalletCreditSummary> Function() load;
  final String currency;
  final ValueChanged<WalletCreditAction>? onAction;

  @override
  State<_WalletCreditSheet> createState() => _WalletCreditSheetState();
}

class _WalletCreditSheetState extends State<_WalletCreditSheet> {
  late Future<WalletCreditSummary> _summary = widget.load();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeCreditSummary,
      actions: [
        if (widget.onAction case final choose?)
          AppButton.primary(
            onPressed: () => choose(WalletCreditAction.payment),
            child: Text(l10n.financeCreditPayment),
          ),
      ],
      child: FutureBuilder(
        future: _summary,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppSkeletonRows();
          }
          final summary = snapshot.data;
          if (summary == null) {
            return AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              tone: AppTone.destructive,
              title: l10n.commonSomethingWentWrong,
              actionLabel: l10n.commonRetry,
              onAction: () => setState(() => _summary = widget.load()),
            );
          }
          return _CreditDetails(
            summary: summary,
            currency: widget.currency,
            onAction: widget.onAction,
          );
        },
      ),
    );
  }
}

class _CreditDetails extends StatelessWidget {
  const _CreditDetails({
    required this.summary,
    required this.currency,
    required this.onAction,
  });

  final WalletCreditSummary summary;
  final String currency;
  final ValueChanged<WalletCreditAction>? onAction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    final visible = financeAmountsVisible(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.md,
      children: [
        AppGroupedCard(
          children: [
            for (final (label, amount) in [
              (l10n.financeCreditLimit, summary.limit),
              (l10n.financeCreditAvailable, summary.available),
              (l10n.financeCreditOutstanding, summary.outstanding),
              (l10n.financeCreditStatementBalance, summary.statementBalance),
              (l10n.financeCreditCurrentActivity, summary.activity),
            ])
              AppRichRow(
                title: label,
                trailing: FinanceAmountText(amount, currency),
              ),
          ],
        ),
        if (visible)
          AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.sm,
              children: [
                Text(
                  l10n.financeCreditUtilization(summary.utilization.round()),
                ),
                AppMeter(value: summary.utilization / 100),
              ],
            ),
          ),
        AppGroupedCard(
          children: [
            AppRichRow(
              title: l10n.financeCreditNextStatement,
              subtitle: dates.formatFullDate(summary.statement),
            ),
            AppRichRow(
              title: l10n.financeCreditPaymentDue,
              subtitle: dates.formatFullDate(summary.payment),
            ),
          ],
        ),
        if (onAction case final choose?)
          AppGroupedCard(
            children: [
              AppRichRow(
                title: l10n.financeCreditCharge,
                leading: const AppIconTile(icon: LucideIcons.creditCard),
                onTap: () => choose(WalletCreditAction.charge),
              ),
              AppRichRow(
                title: l10n.financeCreditRefund,
                leading: const AppIconTile(icon: LucideIcons.rotateCcw),
                onTap: () => choose(WalletCreditAction.refund),
              ),
            ],
          ),
      ],
    );
  }
}
