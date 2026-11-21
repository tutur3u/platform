import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// The answer line under a card once the owner acted: inside the undo
/// window, retrying with a live countdown, refused, closed, or recorded with
/// its pickup status. Null when there is nothing to show and the actions
/// should render. This device's own submission takes precedence over a
/// receipt a poll brought from another device, because it is the newer
/// answer. Without [onRetry] a retrying answer offers no Retry now; without
/// [onDismiss] a refused one offers no Dismiss.
Widget? fleetAnswerStatus({
  required FleetAnswerReceipt? receipt,
  required FleetPendingAnswer? pending,
  required String orchestrator,
  required VoidCallback? onRetry,
  required VoidCallback onUndo,
  VoidCallback? onDismiss,
  DateTime Function()? now,
}) => switch ((receipt, pending?.status)) {
  (_, FleetSendStatus.queued) => _StatusRow(
    icon: LucideIcons.send,
    label: (l10n) => l10n.mastermindFleetAnswerQueued,
    actionLabel: (l10n) => l10n.mastermindFleetUndo,
    onAction: onUndo,
  ),
  (_, FleetSendStatus.retrying) => FleetRetryCountdown(
    at: pending!.nextAttemptAt,
    attempt: pending.attempts + 1,
    challenged: pending.reason == 'verification_required',
    now: now,
    onRetry: onRetry,
  ),
  (_, FleetSendStatus.failed) => _StatusRow(
    icon: LucideIcons.circleX,
    label: (l10n) => l10n.mastermindFleetAnswerRejected(
      fleetRejectionLabel(l10n, pending!.reason),
    ),
    destructive: true,
    actionLabel: onDismiss == null
        ? null
        : (l10n) => l10n.mastermindFleetDismiss,
    onAction: onDismiss,
  ),
  (_, FleetSendStatus.closed) => _StatusRow(
    icon: LucideIcons.circleX,
    label: (l10n) => pending!.reason == 'login_closed'
        ? l10n.mastermindFleetAnswerClosed
        : l10n.mastermindFleetAnswerClosedBeforeSent,
  ),
  (final FleetAnswerReceipt receipt, _) => _Receipt(
    receipt: receipt,
    orchestrator: orchestrator,
  ),
  _ => null,
};

/// Web's refusal code as owner-facing words; an unknown code reads generic.
String fleetRejectionLabel(AppLocalizations l10n, String? reason) =>
    switch (reason) {
      'unknown_option' => l10n.mastermindFleetRejectUnknownOption,
      'forbidden' => l10n.mastermindFleetRejectForbidden,
      'verification_required' => l10n.mastermindFleetRejectChallenge,
      _ => l10n.mastermindFleetRejectInvalid,
    };

/// "Not sent yet · attempt 2 · retrying in 12 s", counting down each second
/// to the next attempt. Every attempt reuses the answer's idempotency key.
class FleetRetryCountdown extends StatefulWidget {
  const FleetRetryCountdown({
    required this.at,
    this.attempt,
    this.challenged = false,
    this.now,
    this.onRetry,
    super.key,
  });

  final DateTime? at;

  /// The number of the next attempt; left out of the label when null.
  final int? attempt;

  /// Web asked for a browser check this app cannot pass.
  final bool challenged;
  final DateTime Function()? now;
  final VoidCallback? onRetry;

  @override
  State<FleetRetryCountdown> createState() => _FleetRetryCountdownState();
}

class _FleetRetryCountdownState extends State<FleetRetryCountdown> {
  late final Timer _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(
      const Duration(seconds: 1),
      (_) => mounted ? setState(() {}) : null,
    );
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = (widget.now ?? DateTime.now)().toUtc();
    final left = widget.at?.difference(now).inSeconds ?? 0;
    return _StatusRow(
      icon: LucideIcons.refreshCw,
      label: (l10n) => switch ((left > 0, widget.challenged)) {
        (true, true) => l10n.mastermindFleetAnswerChallenged(left),
        (true, false) => switch (widget.attempt) {
          final attempt? => l10n.mastermindFleetAnswerRetryingAttempt(
            attempt,
            left,
          ),
          null => l10n.mastermindFleetAnswerRetrying(left),
        },
        (false, _) => l10n.mastermindFleetAnswerSending,
      },
      destructive: widget.challenged,
      actionLabel: widget.onRetry == null
          ? null
          : (l10n) => l10n.mastermindFleetAnswerRetryNow,
      onAction: widget.onRetry,
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
