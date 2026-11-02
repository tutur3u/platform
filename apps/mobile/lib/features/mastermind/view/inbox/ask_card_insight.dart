import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_chips.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_options.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the detail page adds under the question for a hub that publishes the
/// Inbox fields: the risk, expired, resolved-via and incomplete chips, why an
/// option is recommended, and the incomplete note. The page already shows the
/// question, the full text and the timing, and its reply section owns the
/// options, so none of those repeat here. Nothing renders for an older hub.
class AskCardInsight extends StatelessWidget {
  const AskCardInsight({required this.item, this.now, super.key});

  final NeedsYou item;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final ask = inboxAskFor(item, now: now);
    final card = ask.card;
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final chips = askChipSpecs(
      l10n,
      ask,
      locale: Localizations.localeOf(context).toString(),
      now: now ?? DateTime.now(),
      includeTiming: false,
    );
    final why = card.recommendedWhy;
    final label = card.recommendedLabel;
    // The page already says the text is missing or cut short; the note adds
    // what it does not: the text is marked incomplete, or options are missing.
    final note =
        card.incompleteReasons.contains(AskIncompleteReason.textIncomplete) ||
        card.incompleteReasons.contains(AskIncompleteReason.missingOptions);
    if (chips.isEmpty && why == null && !note) return const SizedBox.shrink();
    return Padding(
      key: ValueKey('ask-insight-${item.id}'),
      padding: const EdgeInsets.fromLTRB(
        AppLayout.sectionCaptionInset,
        0,
        AppLayout.sectionCaptionInset,
        AppLayout.sectionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (chips.isNotEmpty)
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [for (final chip in chips) chip.build()],
            ),
          if (label != null && why != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              l10n.mastermindAskCardRecommendedWhy(label, why),
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
                height: 1.4,
              ),
            ),
          ],
          if (note) ...[
            const SizedBox(height: AppSpacing.sm),
            AskNotice(
              tone: AppTone.warning,
              icon: LucideIcons.triangleAlert,
              text: l10n.mastermindAskCardIncompleteMessage,
            ),
          ],
        ],
      ),
    );
  }
}
