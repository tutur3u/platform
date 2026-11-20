import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/finance_module.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class BillSplitsPage extends StatelessWidget {
  const BillSplitsPage({
    this.splitId,
    this.participantId,
    this.settlement = false,
    super.key,
  });

  final String? splitId;
  final String? participantId;
  final bool settlement;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final l10n = context.l10n;
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-bill-splits',
          locations: const {Routes.financeBillSplits},
          title: settlement
              ? l10n.financeBillSplitSettlement
              : l10n.financeBillSplits,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        const FinanceAmountVisibilityShellAction(
          ownerId: 'finance-bill-split-amount-visibility',
          locations: {Routes.financeBillSplits},
        ),
        if (financeBillSplitsEnabled && workspace != null && actor != null)
          _BillSplitContent(
            key: ValueKey((workspace, actor, splitId)),
            workspace: workspace,
            splitId: splitId,
            participantId: participantId,
          )
        else
          AppPageListView(
            children: [
              AppStateMessage(
                icon: LucideIcons.receipt,
                title: l10n.financeBillSplitsUnavailable,
              ),
            ],
          ),
      ],
    );
  }
}

class _BillSplitContent extends StatefulWidget {
  const _BillSplitContent({
    required this.workspace,
    this.splitId,
    this.participantId,
    super.key,
  });

  final String workspace;
  final String? splitId;
  final String? participantId;

  @override
  State<_BillSplitContent> createState() => _BillSplitContentState();
}

class _BillSplitContentState extends State<_BillSplitContent> {
  final _api = ApiClient();
  late Future<Map<String, dynamic>> _response = _load();

  Future<Map<String, dynamic>> _load() {
    final query = widget.splitId == null
        ? ''
        : '?id=${Uri.encodeQueryComponent(widget.splitId!)}';
    return _api.getJson(
      '/api/v1/workspaces/${Uri.encodeComponent(widget.workspace)}'
      '/finance/bill-splits$query',
    );
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: _response,
      builder: (context, snapshot) {
        final data = snapshot.data?['data'];
        final children = switch (snapshot.connectionState) {
          ConnectionState.done when data is List<Object?> => _list(
            context,
            data,
          ),
          ConnectionState.done when data is Map<String, dynamic> => _detail(
            context,
            data,
          ),
          ConnectionState.done => <Widget>[
            AppStateMessage(
              icon: LucideIcons.circleAlert,
              title: l10n.financeBillSplitsUnavailable,
              actionLabel: l10n.commonRetry,
              onAction: () => setState(() => _response = _load()),
            ),
          ],
          _ => <Widget>[const AppSkeletonRows()],
        };
        return AppPageListView(children: children);
      },
    );
  }

  List<Widget> _list(BuildContext context, List<Object?> splits) {
    if (splits.isEmpty) {
      return [
        AppStateMessage(
          icon: LucideIcons.receipt,
          title: context.l10n.financeBillSplitsEmpty,
        ),
      ];
    }
    return [
      AppGroupedCard(
        children: [
          for (final split in splits.whereType<Map<String, dynamic>>())
            AppRichRow(
              leading: const AppIconTile(icon: LucideIcons.receipt),
              title: split['title'] as String,
              onTap: () => context.push(
                Uri(
                  path: Routes.financeBillSplits,
                  queryParameters: {'split': split['id'] as String},
                ).toString(),
              ),
            ),
        ],
      ),
    ];
  }

  List<Widget> _detail(BuildContext context, Map<String, dynamic> split) {
    final l10n = context.l10n;
    final participants = {
      for (final person in _objects(split['participants']))
        person['id'] as String: person['displayName'] as String,
    };
    final participant = widget.participantId;
    if (participant != null && !participants.containsKey(participant)) {
      return [
        AppStateMessage(
          icon: LucideIcons.circleAlert,
          title: l10n.financeBillSplitsUnavailable,
        ),
      ];
    }

    final currency = split['currency'] as Map<String, dynamic>;
    final code = currency['code'] as String;
    final divisor = math.pow(10, currency['minorDigits'] as int);
    final ledger = split['ledger'] as Map<String, dynamic>;
    final plan = ledger['settlement'] as Map<String, dynamic>;
    final transfers = _objects(plan['transfers']).where(
      (row) =>
          participant == null ||
          row['from'] == participant ||
          row['to'] == participant,
    );
    return [
      Text(
        split['title'] as String,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      AppGroupedSection.spaced(
        caption: l10n.financeBillSplitBalances,
        children: [
          for (final row in _objects(ledger['balances']))
            if (participant == null || row['participantId'] == participant)
              AppRichRow(
                title: participants[row['participantId']] ?? '',
                trailing: FinanceAmountText(
                  (row['amountMinor'] as num) / divisor,
                  code,
                ),
              ),
        ],
      ),
      AppGroupedSection.spaced(
        caption: plan['optimal'] == true
            ? l10n.financeBillSplitSettlement
            : l10n.financeBillSplitSuggested,
        children: [
          if (transfers.isEmpty)
            AppRichRow(title: l10n.financeBillSplitNoTransfers),
          for (final row in transfers)
            AppRichRow(
              title: l10n.financeBillSplitPays(
                participants[row['from']] ?? '',
                participants[row['to']] ?? '',
              ),
              trailing: FinanceAmountText(
                (row['amountMinor'] as num) / divisor,
                code,
              ),
            ),
        ],
      ),
    ];
  }

  Iterable<Map<String, dynamic>> _objects(Object? value) =>
      (value as List<Object?>).whereType<Map<String, dynamic>>();
}
