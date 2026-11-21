import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_answer_status.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_decision_context.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_labels.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_login_code.dart';
import 'package:mobile/l10n/l10n.dart';

/// An access request: the service and machine, why it is needed, the expiry
/// countdown, and what the owner does next. A device flow shows its code
/// with Copy and opens the link; a link flow only opens it; a local callback
/// completes only on its machine, so the card names it and opens nothing.
/// "I signed in" posts `signed_in`; the agent verifies before the request
/// reads as verified. At expiry the link and code disappear on this clock,
/// whatever the last snapshot said.
class FleetLoginCard extends StatelessWidget {
  const FleetLoginCard({
    required this.decision,
    required this.login,
    required this.machine,
    required this.orchestrator,
    required this.onSignedIn,
    required this.onRetry,
    this.onUndo,
    this.onSnooze,
    this.receipt,
    this.pending,
    this.now,
    this.launch,
    super.key,
  });

  final FleetDecision decision;
  final FleetLogin login;
  final String? machine;
  final String orchestrator;
  final VoidCallback onSignedIn;
  final VoidCallback onRetry;
  final VoidCallback? onUndo;
  final VoidCallback? onSnooze;
  final FleetAnswerReceipt? receipt;
  final FleetPendingAnswer? pending;
  final DateTime Function()? now;

  /// Test seam for the app's link launcher.
  final MobileLinkLaunch? launch;

  @override
  Widget build(BuildContext context) => FleetClock(
    now: now,
    builder: (context, current) {
      final l10n = context.l10n;
      final tokens = AppTokens.of(context);
      final state = login.stateAt(current);
      final open = login.isOpenAt(current);
      final status = fleetAnswerStatus(
        receipt: receipt,
        pending: pending,
        orchestrator: orchestrator,
        // Web refuses signed_in once the request ended.
        onRetry: open ? onRetry : null,
        onUndo: onUndo ?? () {},
      );
      final sending = pending?.status == FleetSendStatus.sending;
      final where = machine ?? login.machineId;
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppRichRow(
              title: where == null
                  ? login.service.label
                  : l10n.mastermindFleetLoginOn(login.service.label, where),
              subtitle: decision.title,
              leading: AppIconTile(
                icon: LucideIcons.keyRound,
                tone: open ? AppTone.warning : AppTone.neutral,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                AppBadge(variant: state.badge, child: Text(state.label(l10n))),
                if (open && login.expiresAt != null)
                  AppMetaItem(
                    icon: LucideIcons.timer,
                    label: l10n.mastermindFleetExpiresIn(
                      fleetCountdown(
                        l10n,
                        login.expiresAt!.difference(current),
                      ),
                    ),
                  ),
              ],
            ),
            FleetDecisionContext(decision: decision),
            if (open && login.userCode != null) ...[
              const SizedBox(height: AppSpacing.md),
              FleetLoginCode(code: login.userCode!),
            ],
            if (open &&
                login.flow == FleetLoginFlow.localCallback &&
                where != null) ...[
              const SizedBox(height: AppSpacing.md),
              AppMetaItem(
                icon: LucideIcons.monitor,
                label: l10n.mastermindFleetFinishOn(where),
                color: tokens.colorScheme.foreground,
              ),
            ],
            // The provider link stays while the request is open: the agent
            // may still be waiting after an early "I signed in". The answer
            // line replaces only the submission controls.
            if (open) ...[
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  if (login.url case final url?
                      when login.flow != FleetLoginFlow.localCallback)
                    AppButton.outline(
                      leading: const Icon(LucideIcons.externalLink, size: 16),
                      onPressed: () => unawaited(
                        openMobileLink(context, url, launch: launch),
                      ),
                      child: Text(l10n.mastermindFleetOpenHost(url.host)),
                    ),
                  if (status == null && state == FleetLoginState.waiting)
                    AppButton.primary(
                      loading: sending,
                      enabled: !sending,
                      leading: const Icon(LucideIcons.logIn, size: 16),
                      onPressed: onSignedIn,
                      child: Text(l10n.mastermindFleetSignedIn),
                    ),
                  if (status == null && onSnooze != null)
                    AppButton.ghost(
                      enabled: !sending,
                      leading: const Icon(LucideIcons.alarmClock, size: 16),
                      onPressed: onSnooze,
                      child: Text(l10n.mastermindFleetSnooze),
                    ),
                ],
              ),
              if (status != null) ...[
                const SizedBox(height: AppSpacing.md),
                status,
              ],
            ] else if (status != null) ...[
              const SizedBox(height: AppSpacing.md),
              status,
            ],
          ],
        ),
      );
    },
  );
}
