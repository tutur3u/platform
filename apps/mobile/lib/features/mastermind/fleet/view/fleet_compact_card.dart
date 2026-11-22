import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// What a compact card's footer slot says about the owner's answer.
enum FleetCardStatus { idle, sending, sent, failed }

/// The first words of a decision for its two-line summary: the body, else
/// why it was asked, with list and emphasis markers dropped.
String? fleetDecisionSummary(FleetDecision decision) {
  final source = decision.body ?? decision.why;
  if (source == null) return null;
  final text = source
      .split('\n')
      .map((line) => line.replaceFirst(RegExp(r'^\s*(?:[-*]|\d+\.)\s+'), ''))
      .join(' ')
      .replaceAll(RegExp(r'\*\*|`'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return text.isEmpty ? null : text;
}

/// One Inbox row: urgency, kind, who asks and the deadline; the title in two
/// lines; a two-line summary; and a footer slot with the recommended option,
/// or the answer's state. Tapping opens the full decision.
///
/// The footer slot has one fixed height for every [status], so sending,
/// sent and failed never resize the card or move the list.
class FleetCompactCard extends StatelessWidget {
  const FleetCompactCard({
    required this.decision,
    required this.onTap,
    this.status = FleetCardStatus.idle,
    this.answer,
    this.onRetry,
    this.retryLabel,
    this.retrying = false,
    this.kindLabel,
    this.footer,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final VoidCallback onTap;
  final FleetCardStatus status;

  /// The answer's label for the sending, sent and failed states.
  final String? answer;
  final VoidCallback? onRetry;

  /// Overrides the failed line, for an answer still retrying.
  final String? retryLabel;

  /// An attempt is on the wire: Retry waits for it.
  final bool retrying;

  /// Overrides the kind badge, for a kind that names itself.
  final String? kindLabel;

  /// Replaces the footer slot's content (same fixed height), for a kind
  /// with its own single action.
  final Widget? footer;
  final DateTime Function()? now;

  /// The footer slot: a small button's height, or one line of enlarged text.
  static double footerHeight(BuildContext context) =>
      math.max(32, MediaQuery.textScalerOf(context).scale(20));

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final summary = fleetDecisionSummary(decision);
    return AppCard(
      onTap: onTap,
      semanticLabel: '${l10n.mastermindFleetOpenDecision}: ${decision.title}',
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(decision: decision, kindLabel: kindLabel, now: now),
          const SizedBox(height: AppSpacing.sm),
          Text(
            decision.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.heading,
          ),
          if (summary != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              summary,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.bodySm.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Divider(height: 1, thickness: 1, color: tokens.colorScheme.border),
          SizedBox(
            height: footerHeight(context),
            child:
                footer ??
                _Footer(
                  decision: decision,
                  status: status,
                  answer: answer,
                  onRetry: onRetry,
                  retryLabel: retryLabel,
                  retrying: retrying,
                ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.decision, this.kindLabel, this.now});

  final FleetDecision decision;
  final String? kindLabel;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    final urgency = switch (decision.urgency) {
      FleetUrgency.urgent => (
        l10n.mastermindFleetTierUrgent,
        AppBadgeVariant.destructive,
      ),
      FleetUrgency.high => (
        l10n.mastermindFleetUrgencyHigh,
        AppBadgeVariant.warning,
      ),
      FleetUrgency.normal => (
        l10n.mastermindFleetUrgencyNormal,
        AppBadgeVariant.secondary,
      ),
      FleetUrgency.fyi => (l10n.mastermindFleetFyi, AppBadgeVariant.outline),
    };
    final kind =
        kindLabel ??
        switch (decision.kind) {
          FleetDecisionKind.review =>
            decision.review?.document != null
                ? l10n.mastermindFleetMockupBadge
                : l10n.mastermindFleetReviewBadge,
          FleetDecisionKind.login => decision.login?.state.label(l10n),
          FleetDecisionKind.ask => null,
        };
    final caption = tokens.typography.caption.copyWith(color: muted);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Badges wrap onto a second line at large text sizes instead of
        // pushing the time off the card.
        Expanded(
          child: Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              AppBadge(variant: urgency.$2, child: Text(urgency.$1)),
              if (kind != null) AppBadge.outline(child: Text(kind)),
              if (decision.requester case final from?)
                Text(
                  from,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: caption,
                ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Flexible(
          child: FleetClock(
            now: now,
            builder: (context, current) {
              final deadline = decision.deadlineAt;
              final left = deadline?.difference(current);
              final late = left != null && left <= Duration.zero;
              return Text(
                switch (left) {
                  null => fleetAge(l10n, decision.createdAt, current),
                  _ when late => l10n.mastermindFleetPastDeadline,
                  _ => l10n.mastermindFleetDueIn(fleetCountdown(l10n, left)),
                },
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: late
                    ? caption.copyWith(color: tokens.colorScheme.destructive)
                    : caption,
              );
            },
          ),
        ),
        const SizedBox(width: AppSpacing.xs),
        Icon(LucideIcons.chevronRight, size: 16, color: muted),
      ],
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({
    required this.decision,
    required this.status,
    this.answer,
    this.onRetry,
    this.retryLabel,
    this.retrying = false,
  });

  final FleetDecision decision;
  final FleetCardStatus status;
  final String? answer;
  final VoidCallback? onRetry;
  final String? retryLabel;
  final bool retrying;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final style = tokens.typography.uiSm.copyWith(
      color: colors.mutedForeground,
    );
    final strong = tokens.typography.uiSm.copyWith(
      color: colors.foreground,
      fontWeight: FontWeight.w600,
    );
    Widget line(List<Widget> children) => Semantics(
      liveRegion: status != FleetCardStatus.idle,
      child: Row(children: children),
    );
    Widget text(String value, TextStyle style) => Flexible(
      child: Text(
        value,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: style,
      ),
    );
    final label = answer ?? '';
    switch (status) {
      case FleetCardStatus.sending:
        return line([
          const SizedBox.square(
            dimension: 14,
            child: AppLoadingIndicator.inline(),
          ),
          const SizedBox(width: AppSpacing.sm),
          text('${l10n.mastermindFleetAnswerSending} · $label', style),
        ]);
      case FleetCardStatus.sent:
        return line([
          Icon(LucideIcons.circleCheck, size: 14, color: colors.success),
          const SizedBox(width: AppSpacing.sm),
          text(l10n.mastermindFleetAnsweredToast(label), style),
        ]);
      case FleetCardStatus.failed:
        final bad = style.copyWith(color: colors.destructive);
        return line([
          Icon(LucideIcons.circleAlert, size: 14, color: colors.destructive),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              retryLabel ?? l10n.mastermindFleetNotDelivered(label),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: bad,
            ),
          ),
          if (onRetry != null)
            AppButton.outline(
              size: AppButtonSize.small,
              leading: const Icon(LucideIcons.refreshCw, size: 14),
              enabled: !retrying,
              loading: retrying,
              onPressed: onRetry,
              child: Text(l10n.mastermindFleetRetry),
            ),
        ]);
      case FleetCardStatus.idle:
        break;
    }
    final options = decision.options;
    final count = options.isEmpty
        ? null
        : l10n.mastermindFleetOptionsCount(options.length);
    final hint = switch (decision.kind) {
      FleetDecisionKind.login => l10n.mastermindFleetLoginHint,
      FleetDecisionKind.review when options.isEmpty =>
        l10n.mastermindFleetReviewHint,
      _ when options.isEmpty => l10n.mastermindFleetFreeTextHint,
      _ => null,
    };
    final recommended = decision.recommended;
    return line([
      if (recommended != null) ...[
        Icon(LucideIcons.star, size: 14, color: colors.warning),
        const SizedBox(width: AppSpacing.xs),
      ],
      Expanded(
        flex: 3,
        child: Text.rich(
          recommended == null
              ? TextSpan(text: hint ?? '')
              : TextSpan(
                  children: [
                    TextSpan(text: '${l10n.mastermindFleetRecommended} '),
                    TextSpan(text: recommended.label, style: strong),
                  ],
                ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: style,
        ),
      ),
      if (count != null) ...[
        const SizedBox(width: AppSpacing.sm),
        Flexible(
          child: Text(
            count,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.end,
            style: style,
          ),
        ),
      ],
    ]);
  }
}
