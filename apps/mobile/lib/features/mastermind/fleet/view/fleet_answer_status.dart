import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// The answer line under a card once the owner acted: inside the undo
/// window, not sent, closed by Web, or recorded with its pickup status.
/// Null when there is nothing to show and the actions should render. This
/// device's own submission (queued, not sent or closed) takes precedence
/// over a receipt a poll brought from another device, because it is the
/// newer answer. Without [onRetry] a failed send offers no Retry.
Widget? fleetAnswerStatus({
  required FleetAnswerReceipt? receipt,
  required FleetPendingAnswer? pending,
  required String orchestrator,
  required VoidCallback? onRetry,
  required VoidCallback onUndo,
}) => switch ((receipt, pending?.status)) {
  (_, FleetSendStatus.queued) => _StatusRow(
    icon: LucideIcons.send,
    label: (l10n) => l10n.mastermindFleetAnswerQueued,
    actionLabel: (l10n) => l10n.mastermindFleetUndo,
    onAction: onUndo,
  ),
  (_, FleetSendStatus.failed) => _StatusRow(
    icon: LucideIcons.cloudOff,
    label: (l10n) => l10n.mastermindFleetAnswerNotSent,
    destructive: true,
    actionLabel: onRetry == null ? null : (l10n) => l10n.commonRetry,
    onAction: onRetry,
  ),
  (_, FleetSendStatus.closed) => _StatusRow(
    icon: LucideIcons.circleX,
    label: (l10n) => l10n.mastermindFleetAnswerClosed,
  ),
  (final FleetAnswerReceipt receipt, _) => _Receipt(
    receipt: receipt,
    orchestrator: orchestrator,
  ),
  _ => null,
};

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

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.icon,
    required this.label,
    this.destructive = false,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String Function(AppLocalizations) label;
  final bool destructive;
  final String Function(AppLocalizations)? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(
          child: Semantics(
            liveRegion: true,
            child: AppMetaItem(
              icon: icon,
              label: label(l10n),
              color: destructive
                  ? AppTokens.of(context).colorScheme.destructive
                  : null,
            ),
          ),
        ),
        if (actionLabel case final action?)
          AppButton.outline(onPressed: onAction, child: Text(action(l10n))),
      ],
    );
  }
}
