import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/l10n/l10n.dart';

/// Why Live cannot start, with one primary action and "Not now".
///
/// [onUpgrade] and [onTopUp] are supplied only where a store-compliant
/// purchase flow exists; without one the primary action dismisses.
class AssistantLiveBlockedSheet extends StatelessWidget {
  const AssistantLiveBlockedSheet({
    required this.eligibility,
    required this.onClose,
    this.onUpgrade,
    this.onTopUp,
    this.now,
    super.key,
  });

  final AssistantLiveEligibility eligibility;
  final VoidCallback onClose;
  final Future<void> Function()? onUpgrade;
  final Future<void> Function()? onTopUp;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final billedTo = eligibility.billedTo(l10n);
    final upsell = switch (eligibility.reason) {
      AssistantLiveBlockReason.planRequired => (
        label: l10n.assistantLiveBlockedUpgrade,
        action: onUpgrade,
        key: 'live-blocked-upgrade',
      ),
      AssistantLiveBlockReason.creditsExhausted => (
        label: l10n.assistantLiveBlockedTopUp,
        action: onTopUp,
        key: 'live-blocked-top-up',
      ),
      _ => null,
    };
    final primaryAction = upsell?.action;
    return AppSheetScaffold(
      key: ValueKey('live-blocked-${eligibility.reason?.code ?? 'paused'}'),
      title: eligibility.title(l10n),
      showCloseButton: false,
      actions: [
        if (upsell != null && primaryAction != null) ...[
          AppButton.primary(
            key: ValueKey(upsell.key),
            onPressed: () async {
              onClose();
              await primaryAction();
            },
            child: Text(upsell.label),
          ),
          AppButton.ghost(
            key: const ValueKey('live-blocked-not-now'),
            onPressed: onClose,
            child: Text(l10n.assistantLiveBlockedNotNow),
          ),
        ] else
          AppButton.primary(
            key: const ValueKey('live-blocked-got-it'),
            onPressed: onClose,
            child: Text(l10n.assistantLiveBlockedGotIt),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // A refusal is not an error: the orb rests.
          const Center(
            child: SizedBox.square(
              dimension: 112,
              child: FittedBox(
                child: AssistantLivePlaybackBlob(
                  energy: 0,
                  bands: [],
                  active: false,
                  mode: AssistantLiveOrbMode.idle,
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            eligibility.body(l10n, now: now),
            key: const ValueKey('live-blocked-body'),
            textAlign: TextAlign.center,
            style: tokens.typography.p.copyWith(
              color: c.mutedForeground,
              height: 1.45,
            ),
          ),
          if (billedTo != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              billedTo,
              key: const ValueKey('live-blocked-billed-to'),
              textAlign: TextAlign.center,
              style: tokens.typography.small.copyWith(color: c.foreground),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}

/// Opens [AssistantLiveBlockedSheet] for [eligibility].
Future<void> showAssistantLiveBlockedSheet(
  BuildContext context, {
  required AssistantLiveEligibility eligibility,
  Future<void> Function()? onUpgrade,
  Future<void> Function()? onTopUp,
}) => showAppSheet<void>(
  context: context,
  builder: (sheetContext) => AssistantLiveBlockedSheet(
    eligibility: eligibility,
    onUpgrade: onUpgrade,
    onTopUp: onTopUp,
    onClose: () => Navigator.of(sheetContext).maybePop(),
  ),
);
