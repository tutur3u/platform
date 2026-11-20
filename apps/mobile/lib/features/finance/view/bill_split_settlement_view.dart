import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

class BillSplitSettlementView extends StatelessWidget {
  const BillSplitSettlementView({
    required this.split,
    this.participantId,
    super.key,
  });
  final Map<String, dynamic> split;
  final String? participantId;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: AppLayout.itemGap,
    children: _sections(context),
  );

  List<Widget> _sections(BuildContext context) {
    final l10n = context.l10n;
    final participants = {
      for (final person in _objects(split['participants']))
        person['id'] as String: person['displayName'] as String,
    };
    final participant = participantId;
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
      value is List<Object?>
      ? value.whereType<Map<String, dynamic>>()
      : const [];
}
