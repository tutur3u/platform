import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Updated 12 s ago", measured from Web's `receivedAt` (when the publisher's
/// snapshot arrived) and re-rendered every second so the age stays true
/// between polls. Warns when the snapshot is older than [fleetStaleAfter].
class FleetFreshnessLine extends StatefulWidget {
  const FleetFreshnessLine({required this.state, this.now, super.key});

  final FleetViewState state;

  /// Test clock; the wall clock otherwise.
  final DateTime Function()? now;

  @override
  State<FleetFreshnessLine> createState() => _FleetFreshnessLineState();
}

class _FleetFreshnessLineState extends State<FleetFreshnessLine> {
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
    final snapshot = widget.state.snapshot;
    if (snapshot == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final now = (widget.now ?? DateTime.now)().toUtc();
    final age = fleetAge(l10n, snapshot.receivedAt, now);
    final failed = widget.state.failure != null;
    final stale = now.difference(snapshot.receivedAt) > fleetStaleAfter;
    final (text, icon, tone) = failed
        ? (
            l10n.mastermindFleetRefreshFailed(age),
            LucideIcons.cloudOff,
            stale ? AppTone.warning : AppTone.neutral,
          )
        : stale
        ? (
            l10n.mastermindFleetStale(age),
            LucideIcons.triangleAlert,
            AppTone.warning,
          )
        : (
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
            if (widget.state.refreshing)
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
