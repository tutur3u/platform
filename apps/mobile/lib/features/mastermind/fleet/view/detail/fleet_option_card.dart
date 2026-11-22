import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// One answer the owner can pick in a decision's detail: an offered option,
/// or a built-in answer (Approve, Request changes) for a decision without
/// options. [needsText] answers ask for written notes before sending.
class FleetChoice {
  const FleetChoice({
    required this.number,
    required this.label,
    required this.action,
    this.optionId,
    this.description,
    this.recommended = false,
    this.needsText = false,
  });

  final int number;
  final String label;
  final FleetAnswerAction action;
  final String? optionId;
  final String? description;
  final bool recommended;
  final bool needsText;

  /// Stable key across rebuilds and snapshots.
  String get key => optionId ?? action.wire;
}

/// What a choice's action slot shows. [none] keeps the slot's space empty,
/// for an option the owner did not pick on a decision already answered.
enum FleetChoiceSlotState { idle, confirm, sending, sent, failed, none }

/// The action slot under a choice. Every state draws inside one fixed
/// height, so Choose turning into Cancel and Send, or into the answer's
/// state, never moves anything on screen.
class FleetChoiceSlot extends StatelessWidget {
  const FleetChoiceSlot({
    required this.state,
    required this.orchestrator,
    this.recommended = false,
    this.onChoose,
    this.onCancel,
    this.onSend,
    this.onRetry,
    super.key,
  });

  final FleetChoiceSlotState state;
  final String orchestrator;
  final bool recommended;
  final VoidCallback? onChoose;
  final VoidCallback? onCancel;
  final VoidCallback? onSend;
  final VoidCallback? onRetry;

  /// A large button's height, or one line of enlarged text with padding.
  static double height(BuildContext context) =>
      math.max(48, MediaQuery.textScalerOf(context).scale(24) + 16);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    Widget status(IconData icon, String label, Color color) => Semantics(
      liveRegion: true,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.ui.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
    final child = switch (state) {
      FleetChoiceSlotState.idle =>
        recommended
            ? AppButton.primary(
                size: AppButtonSize.large,
                onPressed: onChoose,
                child: Text(l10n.mastermindFleetChooseOption),
              )
            : AppButton.outline(
                size: AppButtonSize.large,
                onPressed: onChoose,
                child: Text(l10n.mastermindFleetChooseOption),
              ),
      FleetChoiceSlotState.confirm => Row(
        children: [
          Expanded(
            child: AppButton.outline(
              size: AppButtonSize.large,
              onPressed: onCancel,
              child: Text(l10n.mastermindFleetCancel),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: AppButton.primary(
              size: AppButtonSize.large,
              leading: const Icon(LucideIcons.send, size: 16),
              onPressed: onSend,
              child: Text(
                l10n.mastermindFleetConfirmSend(orchestrator),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
      FleetChoiceSlotState.sending => AppButton.primary(
        size: AppButtonSize.large,
        loading: true,
        enabled: false,
        onPressed: null,
        child: Text(l10n.mastermindFleetAnswerSending),
      ),
      FleetChoiceSlotState.sent => status(
        LucideIcons.circleCheck,
        l10n.mastermindFleetYourAnswer,
        colors.success,
      ),
      FleetChoiceSlotState.failed => Row(
        children: [
          Expanded(
            child: status(
              LucideIcons.circleAlert,
              l10n.mastermindFleetUndeliveredTitle,
              colors.destructive,
            ),
          ),
          if (onRetry != null)
            AppButton.outline(
              size: AppButtonSize.large,
              leading: const Icon(LucideIcons.refreshCw, size: 16),
              onPressed: onRetry,
              child: Text(l10n.mastermindFleetRetry),
            ),
        ],
      ),
      FleetChoiceSlotState.none => const SizedBox.shrink(),
    };
    return SizedBox(
      height: height(context),
      width: double.infinity,
      child: Align(
        child: SizedBox(width: double.infinity, child: child),
      ),
    );
  }
}

/// One choice as a card: its number, Recommended when it is, the label, and
/// what it means and what happens next. With [fill] the slot sits at the
/// bottom of a fixed-height page, so slots line up across swipes.
class FleetOptionCard extends StatelessWidget {
  const FleetOptionCard({
    required this.choice,
    required this.slot,
    this.fill = true,
    super.key,
  });

  final FleetChoice choice;
  final Widget slot;
  final bool fill;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final description = choice.description;
    return AppCard(
      child: Column(
        mainAxisSize: fill ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.muted,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '${choice.number}',
                  style: tokens.typography.numeric,
                ),
              ),
              if (choice.recommended)
                AppBadge(
                  variant: AppBadgeVariant.warning,
                  leading: const Icon(LucideIcons.star),
                  child: Text(l10n.mastermindFleetRecommended),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(choice.label, style: tokens.typography.heading),
          if (description != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              description,
              style: tokens.typography.body.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ],
          if (fill) const Spacer(),
          const SizedBox(height: AppSpacing.md),
          slot,
        ],
      ),
    );
  }
}
