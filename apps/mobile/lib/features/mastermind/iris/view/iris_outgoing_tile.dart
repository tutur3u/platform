import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_send_cubit.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// A message this device sent, below the feed until the relay's copy arrives,
/// with its receipt: Sending, Queued (only for a queued delivery), Sent, Seen,
/// or Not sent with Retry.
class IrisOutgoingTile extends StatelessWidget {
  const IrisOutgoingTile({
    required this.row,
    required this.onRetry,
    this.canRetry = true,
    super.key,
  });

  final IrisOutgoing row;
  final VoidCallback onRetry;

  /// False while the kill switch is on.
  final bool canRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final receipt = irisReceiptText(l10n, row);
    final tone = row.failed ? c.destructive : c.mutedForeground;
    return Padding(
      key: ValueKey('iris-outgoing-${row.clientId}'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.rowHorizontalPadding,
        vertical: AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.mastermindIrisAuthorOwner,
            style: tokens.typography.small.copyWith(
              color: c.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            row.text,
            style: tokens.typography.base.copyWith(
              color: c.foreground,
              height: 1.4,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Semantics(
                liveRegion: true,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_icon(row), size: 14, color: tone),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      receipt,
                      key: ValueKey('iris-receipt-${row.clientId}'),
                      style: tokens.typography.small.copyWith(color: tone),
                    ),
                  ],
                ),
              ),
              if (row.failed)
                AppButton.outline(
                  size: AppButtonSize.small,
                  onPressed: canRetry ? onRetry : null,
                  child: Text(l10n.mastermindIrisRetry),
                ),
            ],
          ),
        ],
      ),
    );
  }

  IconData _icon(IrisOutgoing row) => switch (row.state) {
    IrisReceiptState.pending || IrisReceiptState.received => LucideIcons.clock,
    IrisReceiptState.delivered when row.delivery == IrisDelivery.queue =>
      LucideIcons.listOrdered,
    IrisReceiptState.delivered => AppIcons.check,
    IrisReceiptState.acked => LucideIcons.checkCheck,
    IrisReceiptState.failed => LucideIcons.circleAlert,
  };
}

/// The relay's receipt in words. "Queued" only for a queued delivery; a
/// received message is still "Sending", never "Delivered".
String irisReceiptText(AppLocalizations l10n, IrisOutgoing row) =>
    switch (row.state) {
      IrisReceiptState.pending ||
      IrisReceiptState.received => l10n.mastermindIrisReceiptSending,
      IrisReceiptState.delivered when row.delivery == IrisDelivery.queue =>
        l10n.mastermindIrisReceiptQueued,
      IrisReceiptState.delivered => l10n.mastermindIrisReceiptSent,
      IrisReceiptState.acked => l10n.mastermindIrisReceiptSeen,
      IrisReceiptState.failed => l10n.mastermindIrisReceiptFailed,
    };
