import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/l10n/l10n.dart';

/// The pay app's billing page for [wsId]; the same page Web Upgrade opens.
Uri assistantLiveBillingUri(String wsId) => Uri(
  scheme: 'https',
  host: 'pay.tuturuuu.com',
  pathSegments: [wsId, 'billing'],
);

/// Why Live cannot start, with one primary action and "Not now".
///
/// Plan and credit refusals never offer purchase on iOS (App Store guideline
/// 3.1.1): they say where to manage the plan as plain text. Android may open
/// the web billing page through [onOpenBilling].
class AssistantLiveBlockedSheet extends StatelessWidget {
  const AssistantLiveBlockedSheet({
    required this.eligibility,
    required this.onClose,
    this.onOpenBilling,
    this.platform,
    this.now,
    super.key,
  });

  final AssistantLiveEligibility eligibility;
  final VoidCallback onClose;
  final Future<void> Function()? onOpenBilling;

  /// Defaults to the running platform.
  final TargetPlatform? platform;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final billedTo = eligibility.billedTo(l10n);
    final billingReason = switch (eligibility.reason) {
      AssistantLiveBlockReason.planRequired ||
      AssistantLiveBlockReason.creditsExhausted => true,
      _ => false,
    };
    final android =
        (platform ?? defaultTargetPlatform) == TargetPlatform.android;
    final openBilling = billingReason && android ? onOpenBilling : null;
    final manageOnWeb = billingReason && openBilling == null;
    return AppSheetScaffold(
      key: ValueKey('live-blocked-${eligibility.reason?.code ?? 'paused'}'),
      title: eligibility.title(l10n),
      showCloseButton: false,
      actions: [
        if (openBilling != null) ...[
          AppButton.primary(
            key: const ValueKey('live-blocked-open-billing'),
            onPressed: () async {
              onClose();
              await openBilling();
            },
            child: Text(l10n.assistantLiveBlockedOpenBilling),
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
          if (manageOnWeb) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              l10n.assistantLiveBlockedManageOnWeb,
              key: const ValueKey('live-blocked-manage-on-web'),
              textAlign: TextAlign.center,
              style: tokens.typography.small.copyWith(color: c.mutedForeground),
            ),
          ],
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

/// Opens [AssistantLiveBlockedSheet] for [eligibility]. [billingWsId] is the
/// workspace Live bills (the actor's personal workspace on mobile).
Future<void> showAssistantLiveBlockedSheet(
  BuildContext context, {
  required AssistantLiveEligibility eligibility,
  String? billingWsId,
}) => showAppSheet<void>(
  context: context,
  builder: (sheetContext) => AssistantLiveBlockedSheet(
    eligibility: eligibility,
    onOpenBilling: billingWsId == null
        ? null
        : () async {
            if (!context.mounted) return;
            await openMobileLink(context, assistantLiveBillingUri(billingWsId));
          },
    onClose: () => Navigator.of(sheetContext).maybePop(),
  ),
);
