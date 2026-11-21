import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_answer_status.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_ask_header.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_ask_options.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inline_reply.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/l10n/l10n.dart';

/// A design-review ask: what to review, its summary, the mockup preview
/// (tap to open the full mockup), Open full mockup, then Approve or Request
/// changes. Request changes opens a notes box that sends `request_changes`
/// through the same outbox as every answer. Hold, a free reply and Snooze
/// sit in the overflow sheet.
class FleetReviewCard extends StatefulWidget {
  const FleetReviewCard({
    required this.decision,
    required this.review,
    required this.orchestrator,
    required this.onAnswer,
    required this.onRetry,
    this.onUndo,
    this.onDismiss,
    this.onSnooze,
    this.receipt,
    this.pending,
    this.loadAsset,
    this.launch,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final FleetReview review;
  final String orchestrator;
  final FleetAnswerCallback onAnswer;
  final VoidCallback onRetry;
  final VoidCallback? onUndo;
  final VoidCallback? onDismiss;
  final VoidCallback? onSnooze;
  final FleetAnswerReceipt? receipt;
  final FleetPendingAnswer? pending;
  final FleetReviewAssetLoader? loadAsset;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;
  final DateTime Function()? now;

  @override
  State<FleetReviewCard> createState() => _FleetReviewCardState();
}

/// What the notes box sends.
enum _Notes { changes, reply }

class _FleetReviewCardState extends State<FleetReviewCard> {
  _Notes? _notes;

  void _open() => unawaited(
    openMobileLink(context, widget.review.mockupUrl, launch: widget.launch),
  );

  void _send(String text) {
    final action = _notes == _Notes.reply
        ? FleetAnswerAction.reply
        : FleetAnswerAction.requestChanges;
    setState(() => _notes = null);
    widget.onAnswer(action, text: text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final decision = widget.decision;
    final status = fleetAnswerStatus(
      receipt: widget.receipt,
      pending: widget.pending,
      orchestrator: widget.orchestrator,
      onRetry: widget.onRetry,
      onUndo: widget.onUndo ?? () {},
      onDismiss: widget.onDismiss,
      now: widget.now,
    );
    final sending = widget.pending?.status == FleetSendStatus.sending
        ? widget.pending!.action
        : null;
    final preview = widget.review.preview;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FleetAskHeader(
            decision: decision,
            badge: l10n.mastermindFleetReviewBadge,
            now: widget.now,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(decision.title, style: tokens.typography.large),
          if (decision.why case final why?) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              why,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
          if (preview != null) ...[
            const SizedBox(height: AppSpacing.md),
            FleetReviewPreviewImage(
              preview: preview,
              loadAsset: widget.loadAsset,
              onOpen: _open,
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          AppButton.outline(
            leading: const Icon(LucideIcons.externalLink, size: 16),
            onPressed: _open,
            child: Text(l10n.mastermindFleetReviewOpenMockup),
          ),
          const SizedBox(height: AppSpacing.md),
          ?status,
          if (status == null) ..._actions(l10n, sending),
        ],
      ),
    );
  }

  List<Widget> _actions(AppLocalizations l10n, FleetAnswerAction? sending) => [
    AppButton.primary(
      loading: sending == FleetAnswerAction.approve,
      enabled: sending == null,
      leading: const Icon(LucideIcons.check, size: 16),
      onPressed: () => widget.onAnswer(FleetAnswerAction.approve),
      child: Text(l10n.mastermindFleetApprove),
    ),
    const SizedBox(height: AppSpacing.sm),
    Row(
      children: [
        Expanded(
          child: AppButton.outline(
            loading: sending == FleetAnswerAction.requestChanges,
            enabled: sending == null,
            selected: _notes == _Notes.changes,
            leading: const Icon(LucideIcons.pencil, size: 16),
            onPressed: () => setState(
              () => _notes = _notes == _Notes.changes ? null : _Notes.changes,
            ),
            child: Text(l10n.mastermindFleetReviewRequestChanges),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        FleetAskOptions(
          decision: widget.decision,
          sending: sending,
          onAnswer: widget.onAnswer,
          onSnooze: widget.onSnooze,
          moreOnly: true,
          overflow: [
            AppSheetAction(
              label: l10n.mastermindFleetReply,
              icon: LucideIcons.messageSquare,
              value: () => setState(() => _notes = _Notes.reply),
            ),
          ],
        ),
      ],
    ),
    if (_notes case final notes?) ...[
      const SizedBox(height: AppSpacing.sm),
      FleetInlineReply(
        key: ValueKey(notes),
        autofocus: true,
        enabled: sending == null,
        placeholder: notes == _Notes.changes
            ? l10n.mastermindFleetReviewChangesPlaceholder
            : null,
        onSend: _send,
      ),
    ],
  ];
}
