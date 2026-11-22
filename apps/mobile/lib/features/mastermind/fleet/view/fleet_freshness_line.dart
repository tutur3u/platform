import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_banner.dart';
import 'package:mobile/l10n/l10n.dart';

/// Which side is behind. "Live · published 12 s ago" while the snapshot is
/// fresh, measured from Web's `receivedAt` and re-rendered every second.
/// "Phone offline" when this device's own refresh cannot reach Web, with the
/// time of the data on screen. "Publisher paused" when this device reads Web
/// fine but the snapshot is older than [fleetStaleAfter]: the machine stopped
/// publishing. Any other refresh failure keeps the "Couldn't refresh" line.
class FleetFreshnessLine extends StatelessWidget {
  const FleetFreshnessLine({required this.state, this.now, super.key});

  final FleetViewState state;

  /// Test clock; the wall clock otherwise.
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final snapshot = state.snapshot;
    if (snapshot == null) return const SizedBox.shrink();
    final failure = state.failure;
    if (failure == FleetFailure.unavailable) {
      return FleetFreshnessBanner.offline(
        shownAt: state.lastFetchedAt ?? snapshot.receivedAt,
      );
    }
    return FleetClock(
      now: now,
      builder: (context, current) =>
          failure == null &&
              current.difference(snapshot.receivedAt) > fleetStaleAfter
          ? FleetFreshnessBanner.paused(
              publishedAt: snapshot.receivedAt,
              now: current,
            )
          : FleetReceiptFreshnessLine(
              receivedAt: snapshot.receivedAt,
              failed: failure != null,
              refreshing: state.refreshing,
              freshLabel: (l10n, age) => l10n.mastermindFleetLive(age),
              now: now,
            ),
    );
  }
}

class FleetReceiptFreshnessLine extends StatefulWidget {
  const FleetReceiptFreshnessLine({
    required this.receivedAt,
    this.failed = false,
    this.refreshing = false,
    this.freshLabel,
    this.staleLabel,
    this.now,
    super.key,
  });

  final DateTime receivedAt;
  final bool failed;
  final bool refreshing;

  /// The fresh-state wording; "Updated {age}" without it.
  final String Function(AppLocalizations l10n, String age)? freshLabel;
  final String Function(AppLocalizations l10n, String age)? staleLabel;
  final DateTime Function()? now;

  @override
  State<FleetReceiptFreshnessLine> createState() => _FleetFreshnessLineState();
}

class _FleetFreshnessLineState extends State<FleetReceiptFreshnessLine> {
  Timer? _ticker;

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
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final now = (widget.now ?? DateTime.now)().toUtc();
    final age = fleetAge(l10n, widget.receivedAt, now);
    final stale = now.difference(widget.receivedAt) > fleetStaleAfter;
    final (text, icon, tone) = widget.failed
        ? (
            l10n.mastermindFleetRefreshFailed(age),
            LucideIcons.cloudOff,
            stale ? AppTone.warning : AppTone.neutral,
          )
        : stale
        ? (
            widget.staleLabel?.call(l10n, age) ??
                l10n.mastermindFleetStale(age),
            LucideIcons.triangleAlert,
            AppTone.warning,
          )
        : (
            widget.freshLabel?.call(l10n, age) ??
                l10n.mastermindFleetUpdated(age),
            LucideIcons.refreshCw,
            AppTone.neutral,
          );
    final warning = tone == AppTone.warning;
    return Semantics(
      liveRegion: warning,
      container: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Row(
          children: [
            if (warning) ...[
              Container(
                width: 3,
                height: 16,
                decoration: BoxDecoration(
                  color: tone.foreground(tokens.colorScheme),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
            if (widget.refreshing)
              SizedBox.square(
                dimension: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: tokens.colorScheme.mutedForeground,
                ),
              )
            else
              Icon(icon, size: 14, color: tone.foreground(tokens.colorScheme)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: tokens.typography.small.copyWith(
                  color: warning
                      ? tokens.colorScheme.foreground
                      : tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
