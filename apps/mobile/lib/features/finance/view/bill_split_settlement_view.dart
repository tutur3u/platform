import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

class BillSplitSettlementView extends StatelessWidget {
  const BillSplitSettlementView({
    required this.split,
    required this.workspaceId,
    required this.splitId,
    this.participantId,
    this.settlement = false,
    super.key,
  });

  final Map<String, dynamic> split;
  final String workspaceId;
  final String splitId;
  final String? participantId;
  final bool settlement;

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
    final showNavigation = participant == null && !settlement;
    return [
      Text(
        split['title'] as String,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      AppButton.secondary(
        onPressed: () => _copyLink(context),
        child: Text(l10n.financeBillSplitCopyLink),
      ),
      if (showNavigation)
        AppButton.secondary(
          onPressed: () => context.push(
            Routes.financeBillSplitLocation(splitId, settlement: true),
          ),
          child: Text(l10n.financeBillSplitViewSettlement),
        ),
      AppGroupedSection.spaced(
        caption: l10n.financeBillSplitBalances,
        children: [
          for (final row in _objects(ledger['balances']))
            if (participant == null || row['participantId'] == participant)
              AppRichRow(
                title: participants[row['participantId']] ?? '',
                onTap: showNavigation
                    ? () => context.push(
                        Routes.financeBillSplitLocation(
                          splitId,
                          participantId: row['participantId'] as String,
                        ),
                      )
                    : null,
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: AppSpacing.xs,
                  children: [
                    FinanceAmountText(
                      (row['amountMinor'] as num) / divisor,
                      code,
                    ),
                    if (showNavigation)
                      const Icon(LucideIcons.chevronRight, size: 16),
                  ],
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

  Future<void> _copyLink(BuildContext context) async {
    final participant = participantId;
    final link = Uri(
      scheme: 'https',
      host: 'tuturuuu.com',
      pathSegments: [
        Localizations.localeOf(context).languageCode,
        workspaceId,
        'finance',
        'bill-splits',
        splitId,
        if (participant != null) ...[
          'participants',
          participant,
        ] else if (settlement)
          'settlement',
      ],
    );

    try {
      await Clipboard.setData(ClipboardData(text: link.toString()));
    } on PlatformException {
      if (context.mounted) {
        showAppToast(context, message: context.l10n.commonSomethingWentWrong);
      }
      return;
    }
    if (context.mounted) {
      showAppToast(context, message: context.l10n.financeBillSplitLinkCopied);
    }
  }

  Iterable<Map<String, dynamic>> _objects(Object? value) =>
      value is List<Object?>
      ? value.whereType<Map<String, dynamic>>()
      : const [];
}
