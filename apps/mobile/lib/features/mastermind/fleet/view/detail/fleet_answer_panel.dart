import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_entry.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_row.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// The recorded answer on a decision that is answered or closed: what was
/// chosen, who answered and how, when in ICT, and how far delivery got.
/// An answer still inside its undo window offers Undo.
class FleetAnswerPanel extends StatelessWidget {
  const FleetAnswerPanel({
    required this.entry,
    required this.orchestrator,
    this.onUndo,
    super.key,
  });

  final FleetHistoryEntry entry;
  final String orchestrator;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final (state, icon, color) = fleetHistoryState(
      context,
      entry,
      orchestrator,
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.mastermindFleetYourAnswer.toUpperCase(),
            style: tokens.typography.overline.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppKeyValueRow(
            label: l10n.mastermindFleetHistoryAnswer,
            value: fleetHistoryOutcome(l10n, entry),
          ),
          AppKeyValueRow(
            label: l10n.mastermindFleetHistoryVia,
            value: fleetHistoryWho(l10n, entry, orchestrator),
          ),
          AppKeyValueRow(
            label: l10n.mastermindFleetHistoryWhen,
            value: l10n.mastermindFleetHistoryTimeIct(
              '${Gmt7.day(entry.at, locale)} ${Gmt7.time(entry.at, locale)}',
            ),
          ),
          Semantics(
            liveRegion: true,
            child: AppKeyValueRow(
              label: l10n.mastermindFleetHistoryStatus,
              value: state,
              trailing: Icon(icon, size: 16, color: color),
            ),
          ),
          if (entry.undoable && onUndo != null) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton.outline(
              leading: const Icon(LucideIcons.undo2, size: 16),
              onPressed: onUndo,
              child: Text(l10n.mastermindFleetUndo),
            ),
          ],
        ],
      ),
    );
  }
}
