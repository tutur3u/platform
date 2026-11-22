import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_answer_panel.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_markdown_body.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_option_carousel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_ask_header.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_entry.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_section.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_view.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// [decision]'s answers in canonical order: its options (the recommended
/// one marked), or Approve for an ask without options. A design review
/// always ends with Request changes, which asks for notes.
List<FleetChoice> fleetChoices(
  AppLocalizations l10n,
  FleetDecision decision,
  String orchestrator,
) {
  final choices = [
    for (final (index, option) in decision.options.indexed)
      FleetChoice(
        number: index + 1,
        label: option.label,
        optionId: option.id,
        description: option.description,
        recommended: option.id == decision.recommendedOptionId,
        action: FleetAnswerAction.approve,
      ),
  ];
  if (decision.kind == FleetDecisionKind.login) return const [];
  if (choices.isEmpty) {
    choices.add(
      FleetChoice(
        number: 1,
        label: l10n.mastermindFleetApproveOption,
        description: l10n.mastermindFleetApproveDescription(orchestrator),
        action: FleetAnswerAction.approve,
      ),
    );
  }
  if (decision.kind == FleetDecisionKind.review) {
    choices.add(
      FleetChoice(
        number: choices.length + 1,
        label: l10n.mastermindFleetReviewRequestChanges,
        description: l10n.mastermindFleetChangesDescription(orchestrator),
        action: FleetAnswerAction.requestChanges,
        needsText: true,
      ),
    );
  }
  return choices;
}

/// Which choice an answered decision shows as picked, and in what state.
(String?, FleetChoiceSlotState) fleetLockedChoice(FleetHistoryEntry entry) {
  final pending = entry.pending;
  final action = entry.action ?? pending?.action;
  final key = switch (action) {
    FleetAnswerAction.approve =>
      pending?.optionId ??
          entry.decision?.options
              .where((o) => o.label == entry.outcome)
              .firstOrNull
              ?.id ??
          FleetAnswerAction.approve.wire,
    FleetAnswerAction.requestChanges => FleetAnswerAction.requestChanges.wire,
    _ => null,
  };
  final state = switch (entry.status) {
    FleetHistoryStatus.sending ||
    FleetHistoryStatus.retrying => FleetChoiceSlotState.sending,
    FleetHistoryStatus.waiting ||
    FleetHistoryStatus.received ||
    FleetHistoryStatus.delivered => FleetChoiceSlotState.sent,
    _ => FleetChoiceSlotState.none,
  };
  return (key, state);
}

/// A decision in full: who asks and when it is due, the title, the whole
/// description, the mockup for a review, then the answers as swipeable
/// cards with Reply, Hold and Snooze below, and the context rows. With
/// [readOnly] the decision can no longer be answered; [entry] then shows
/// its recorded answer when one is known.
class FleetDecisionDetail extends StatelessWidget {
  const FleetDecisionDetail({
    required this.decision,
    required this.orchestrator,
    required this.onSend,
    required this.readOnly,
    this.entry,
    this.position,
    this.loginCard,
    this.notice,
    this.onReply,
    this.onHold,
    this.onSnooze,
    this.onUndo,
    this.onRetry,
    this.next,
    this.onOpenNext,
    this.loadAsset,
    this.launch,
    this.webView = fleetMockupWebView,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final String orchestrator;
  final ValueChanged<FleetChoice> onSend;

  /// The decision can no longer be answered: no actions, choices locked.
  final bool readOnly;

  /// The recorded answer of an answered or closed decision, when known.
  final FleetHistoryEntry? entry;

  /// Where this decision sits in the Inbox: index from 1, and the total.
  final (int, int)? position;

  /// A sign-in request draws its own card with its own actions.
  final Widget? loginCard;

  /// Shown under the title, for an answer that came back undelivered.
  final Widget? notice;
  final VoidCallback? onReply;
  final VoidCallback? onHold;
  final VoidCallback? onSnooze;
  final VoidCallback? onUndo;
  final VoidCallback? onRetry;
  final FleetDecision? next;
  final VoidCallback? onOpenNext;
  final FleetReviewAssetLoader? loadAsset;
  final MobileLinkLaunch? launch;
  final FleetMockupWebView webView;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    if (decision.kind == FleetDecisionKind.secret) {
      return const SizedBox.shrink();
    }
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final entry = this.entry;
    final review = decision.review;
    final body = decision.body;
    final choices = fleetChoices(l10n, decision, orchestrator);
    final (lockedKey, lockedState) = entry == null
        ? (null, FleetChoiceSlotState.none)
        : fleetLockedChoice(entry);
    Widget gap([double size = AppSpacing.lg]) => SizedBox(height: size);
    final context0 = [
      if (decision.why case final why? when body != null)
        (l10n.mastermindFleetWhy, why),
      if (decision.defaultOutcome case final outcome?)
        (l10n.mastermindFleetIfNoAnswer, outcome),
      (
        l10n.mastermindFleetAsked,
        l10n.mastermindFleetHistoryTimeIct(
          '${Gmt7.day(decision.createdAt, locale)} '
          '${Gmt7.time(decision.createdAt, locale)}',
        ),
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: FleetAskHeader(
                decision: decision,
                badge: switch (decision.kind) {
                  FleetDecisionKind.review => l10n.mastermindFleetReviewBadge,
                  FleetDecisionKind.login ||
                  FleetDecisionKind.ask ||
                  FleetDecisionKind.secret => null,
                },
                now: now,
              ),
            ),
            if (position case (final index, final total)?)
              Text(
                l10n.mastermindFleetPosition(index, total),
                style: tokens.typography.numeric.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
          ],
        ),
        gap(AppSpacing.sm),
        Text(decision.title, style: tokens.typography.title),
        if (notice case final notice?) ...[gap(AppSpacing.md), notice],
        if (body != null) ...[
          gap(AppSpacing.md),
          FleetMarkdownBody(data: body),
        ] else if (decision.why case final why?) ...[
          gap(AppSpacing.md),
          Text(why, style: tokens.typography.bodyLg),
        ],
        if (review != null) ...[
          gap(),
          FleetMockupSection(
            title: decision.title,
            review: review,
            loadAsset: loadAsset,
            launch: launch,
            webView: webView,
          ),
        ],
        if (loginCard case final card?) ...[gap(), card],
        if (entry != null) ...[
          gap(),
          FleetAnswerPanel(
            entry: entry,
            orchestrator: orchestrator,
            onUndo: onUndo,
          ),
        ],
        if (choices.isNotEmpty) ...[
          gap(AppSpacing.xl),
          FleetOptionCarousel(
            key: ValueKey('choices-${decision.id}'),
            choices: choices,
            orchestrator: orchestrator,
            onSend: onSend,
            lockedKey: readOnly ? lockedKey ?? '' : null,
            lockedState: lockedState,
            onRetry: onRetry,
          ),
        ],
        if (!readOnly && decision.kind != FleetDecisionKind.login) ...[
          gap(AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: AppButton.outline(
                  leading: const Icon(LucideIcons.messageSquare, size: 16),
                  onPressed: onReply,
                  child: Text(l10n.mastermindFleetReply),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton.outline(
                  leading: const Icon(LucideIcons.pause, size: 16),
                  onPressed: onHold,
                  child: Text(l10n.mastermindFleetHold),
                ),
              ),
              if (onSnooze != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton.outline(
                    leading: const Icon(LucideIcons.alarmClock, size: 16),
                    onPressed: onSnooze,
                    child: Text(l10n.mastermindFleetSnooze),
                  ),
                ),
              ],
            ],
          ),
        ],
        gap(),
        AppCard(
          child: Column(
            children: [
              for (final (label, value) in context0)
                AppKeyValueRow(label: label, value: value),
            ],
          ),
        ),
        if (next case final next? when onOpenNext != null) ...[
          gap(AppSpacing.md),
          AppCard(
            onTap: onOpenNext,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.mastermindFleetUpNext(next.title),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.ui,
                  ),
                ),
                Icon(
                  LucideIcons.chevronRight,
                  size: 18,
                  color: colors.mutedForeground,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
