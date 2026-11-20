import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_reply_sheet.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// One open decision: urgency, the question, its options (the recommended one
/// preselected), and Approve, Hold and Reply. Once answered it shows what was
/// sent and whether the orchestrator has picked it up.
class FleetDecisionCard extends StatefulWidget {
  const FleetDecisionCard({
    required this.decision,
    required this.orchestrator,
    required this.onAnswer,
    required this.onRetry,
    this.receipt,
    this.pending,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final String orchestrator;
  final FleetAnswerReceipt? receipt;
  final FleetPendingAnswer? pending;
  final DateTime Function()? now;
  final void Function(
    FleetAnswerAction action, {
    String? optionId,
    String? text,
  })
  onAnswer;
  final VoidCallback onRetry;

  @override
  State<FleetDecisionCard> createState() => _FleetDecisionCardState();
}

class _FleetDecisionCardState extends State<FleetDecisionCard> {
  late String? _option =
      widget.decision.recommendedOptionId ??
      (widget.decision.options.length == 1
          ? widget.decision.options.single.id
          : null);

  Future<void> _reply() async {
    final text = await showFleetReplySheet(
      context,
      orchestrator: widget.orchestrator,
      question: widget.decision.title,
    );
    if (text != null && text.trim().isNotEmpty) {
      widget.onAnswer(
        FleetAnswerAction.reply,
        optionId: _option,
        text: text.trim(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final decision = widget.decision;
    final sending = widget.pending?.status == FleetSendStatus.sending;
    final answered = widget.receipt != null;
    final needsOption = decision.options.length > 1 && _option == null;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(decision: decision, now: widget.now),
          const SizedBox(height: AppSpacing.sm),
          Text(decision.title, style: tokens.typography.large),
          if (decision.body case final body?) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              body,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
          if (decision.options.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final option in decision.options)
                  AppChip(
                    label: Text(
                      option.id == decision.recommendedOptionId
                          ? '${option.label} · '
                                '${l10n.mastermindFleetRecommended}'
                          : option.label,
                    ),
                    selected: _option == option.id,
                    inMutuallyExclusiveGroup: true,
                    onSelected: answered || sending
                        ? null
                        : (_) => setState(() => _option = option.id),
                  ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          if (widget.receipt case final receipt?)
            _Receipt(receipt: receipt, orchestrator: widget.orchestrator)
          else if (widget.pending?.status == FleetSendStatus.failed)
            _NotSent(onRetry: widget.onRetry)
          else
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppButton.primary(
                  loading:
                      sending &&
                      widget.pending?.action == FleetAnswerAction.approve,
                  enabled: !sending && !needsOption,
                  leading: const Icon(LucideIcons.check, size: 16),
                  onPressed: () => widget.onAnswer(
                    FleetAnswerAction.approve,
                    optionId: _option,
                  ),
                  child: Text(l10n.mastermindFleetApprove),
                ),
                AppButton.outline(
                  loading:
                      sending &&
                      widget.pending?.action == FleetAnswerAction.hold,
                  enabled: !sending,
                  leading: const Icon(LucideIcons.pause, size: 16),
                  onPressed: () => widget.onAnswer(FleetAnswerAction.hold),
                  child: Text(l10n.mastermindFleetHold),
                ),
                AppButton.ghost(
                  loading:
                      sending &&
                      widget.pending?.action == FleetAnswerAction.reply,
                  enabled: !sending,
                  leading: const Icon(LucideIcons.messageSquare, size: 16),
                  onPressed: () => unawaited(_reply()),
                  child: Text(l10n.mastermindFleetReply),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.decision, this.now});

  final FleetDecision decision;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = (now ?? DateTime.now)().toUtc();
    final locale = Localizations.localeOf(context).toLanguageTag();
    final badge = switch (decision.urgency) {
      FleetUrgency.urgent => AppBadge(
        variant: AppBadgeVariant.destructive,
        leading: const Icon(LucideIcons.circleAlert, size: 12),
        child: Text(l10n.mastermindFleetUrgent),
      ),
      FleetUrgency.high => AppBadge(
        variant: AppBadgeVariant.warning,
        leading: const Icon(LucideIcons.arrowUp, size: 12),
        child: Text(l10n.mastermindFleetHigh),
      ),
      FleetUrgency.fyi => AppBadge.outline(
        child: Text(l10n.mastermindFleetFyi),
      ),
      FleetUrgency.normal => null,
    };
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        ?badge,
        AppMetaItem(
          icon: LucideIcons.clock,
          label: fleetAge(l10n, decision.createdAt, current),
        ),
        if (decision.deadlineAt case final deadline?)
          AppMetaItem(
            icon: LucideIcons.calendarClock,
            label: l10n.mastermindFleetDue(
              '${Gmt7.day(deadline, locale)} ${Gmt7.time(deadline, locale)}',
            ),
            color: deadline.isBefore(current)
                ? AppTokens.of(context).colorScheme.destructive
                : null,
          ),
      ],
    );
  }
}

class _Receipt extends StatelessWidget {
  const _Receipt({required this.receipt, required this.orchestrator});

  final FleetAnswerReceipt receipt;
  final String orchestrator;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = receipt.pickedUp
        ? l10n.mastermindFleetAnswerReceived(orchestrator)
        : l10n.mastermindFleetAnswerWaiting(orchestrator);
    return AppMetaItem(
      icon: receipt.pickedUp ? LucideIcons.circleCheck : LucideIcons.hourglass,
      label: '${receipt.action.doneLabel(l10n)} · $status',
      color: receipt.pickedUp
          ? AppTokens.of(context).colorScheme.success
          : null,
    );
  }
}

class _NotSent extends StatelessWidget {
  const _NotSent({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: AppMetaItem(
          icon: LucideIcons.cloudOff,
          label: context.l10n.mastermindFleetAnswerNotSent,
          color: AppTokens.of(context).colorScheme.destructive,
        ),
      ),
      AppButton.outline(
        onPressed: onRetry,
        child: Text(context.l10n.commonRetry),
      ),
    ],
  );
}
