import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/ship/ship_card.dart';
import 'package:mobile/features/mastermind/ship/ship_data.dart';
import 'package:mobile/features/mastermind/ship/ship_view.dart';
import 'package:mobile/l10n/l10n.dart';

/// One or more sources failed; the rows that rely on them say Partial.
class ShipPartialBanner extends StatelessWidget {
  const ShipPartialBanner({required this.view, super.key});

  final ShipView view;

  @override
  Widget build(BuildContext context) {
    final failed = view.snapshot.sources
        .where(
          (s) =>
              s.state == ShipSourceState.error ||
              s.state == ShipSourceState.backoff,
        )
        .map((s) => shipChips(context, s.id))
        .toSet()
        .join(', ');
    return AppAlert(
      variant: AppAlertVariant.warning,
      content: Text(context.l10n.mastermindShipLivePartial(failed)),
    );
  }
}

/// Every configured source is down: rows stay hidden unless the owner asks
/// for the last snapshot, which then renders marked stale.
class ShipErrorBanner extends StatelessWidget {
  const ShipErrorBanner({
    required this.view,
    required this.onRetry,
    required this.onViewStale,
    required this.busy,
    super.key,
  });

  final ShipView view;
  final VoidCallback onRetry;
  final VoidCallback onViewStale;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final last = view.lastGoodCheck;
    final time = last == null ? null : shipTime(context, last);
    return AppAlert.destructive(
      title: Text(l10n.mastermindShipLiveErrorTitle),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.sm,
        children: [
          Text(
            time == null
                ? l10n.mastermindShipLiveErrorNever
                : l10n.mastermindShipLiveErrorBody(time),
          ),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppButton(
                onPressed: busy ? null : onRetry,
                leading: const Icon(LucideIcons.refreshCw),
                child: Text(l10n.mastermindShipLiveTryAgain),
              ),
              if (time != null)
                AppButton.outline(
                  onPressed: onViewStale,
                  child: Text(l10n.mastermindShipLiveViewStale(time)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// No snapshot exists yet: the collector has not run since it was enabled.
class ShipEmptyState extends StatelessWidget {
  const ShipEmptyState({super.key});

  @override
  Widget build(BuildContext context) => AppStateMessage(
    icon: LucideIcons.rocket,
    title: context.l10n.mastermindShipLiveEmptyTitle,
    message: context.l10n.mastermindShipLiveEmptyBody,
  );
}

/// The latest read failed while an older snapshot is on screen.
class ShipRefreshFailedBanner extends StatelessWidget {
  const ShipRefreshFailedBanner({
    required this.showingStale,
    required this.onRetry,
    required this.onViewStale,
    super.key,
  });

  final bool showingStale;
  final VoidCallback onRetry;
  final VoidCallback onViewStale;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppAlert.destructive(
      title: Text(l10n.mastermindShipLiveLoadTitle),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.sm,
        children: [
          Text(
            showingStale
                ? l10n.mastermindShipLiveLoadStaleBody
                : l10n.mastermindShipLiveLoadBody,
          ),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppButton(
                onPressed: onRetry,
                leading: const Icon(LucideIcons.refreshCw),
                child: Text(l10n.mastermindShipLiveTryAgain),
              ),
              if (!showingStale)
                AppButton.outline(
                  onPressed: onViewStale,
                  child: Text(l10n.mastermindShipLiveViewLast),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
