import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

typedef FleetAnswerCallback =
    void Function(FleetAnswerAction action, {String? optionId, String? text});

/// An ask's answers in one tap: numbered options in their canonical order,
/// the recommended one filled across the card, one more beside the overflow
/// button, and the rest with Hold and Snooze in the overflow sheet. Without
/// options, Approve and Hold. [overflow] adds card-specific entries;
/// [moreOnly] renders just the overflow button, with Hold in its sheet, for
/// a card that draws its own answers.
class FleetAskOptions extends StatelessWidget {
  const FleetAskOptions({
    required this.decision,
    required this.onAnswer,
    this.sending,
    this.onSnooze,
    this.overflow = const [],
    this.moreOnly = false,
    super.key,
  });

  final FleetDecision decision;
  final FleetAnswerCallback onAnswer;

  /// The action on the wire, which shows a spinner and blocks the rest.
  final FleetAnswerAction? sending;
  final VoidCallback? onSnooze;
  final List<AppSheetAction<VoidCallback>> overflow;
  final bool moreOnly;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final options = moreOnly ? const <FleetOption>[] : decision.options;
    final recommended = decision.recommended;
    final busy = sending != null;
    final primary =
        recommended ?? (options.length == 1 ? options.single : null);
    final secondary = [
      for (final option in options)
        if (option != primary) option,
    ];
    final inline = secondary.take(primary == null ? 2 : 1).toList();
    final more = secondary.skip(inline.length).toList();

    Widget option(FleetOption option, {bool filled = false}) {
      final number = Text('${options.indexOf(option) + 1}');
      void pick() => onAnswer(FleetAnswerAction.approve, optionId: option.id);
      return filled
          ? AppButton.primary(
              leading: number,
              loading: sending == FleetAnswerAction.approve,
              enabled: !busy,
              semanticLabel: option == recommended
                  ? '${option.label}, ${l10n.mastermindFleetRecommended}'
                  : null,
              onPressed: pick,
              child: Text(option.label),
            )
          : AppButton.outline(
              leading: number,
              enabled: !busy,
              onPressed: pick,
              child: Text(option.label),
            );
    }

    final sheet = <AppSheetAction<VoidCallback>>[
      for (final extra in more)
        AppSheetAction(
          label: '${options.indexOf(extra) + 1}. ${extra.label}',
          icon: LucideIcons.check,
          value: () => onAnswer(FleetAnswerAction.approve, optionId: extra.id),
        ),
      if (options.isNotEmpty || moreOnly)
        AppSheetAction(
          label: l10n.mastermindFleetHold,
          icon: LucideIcons.pause,
          value: () => onAnswer(FleetAnswerAction.hold),
        ),
      ...overflow,
      if (onSnooze case final snooze?)
        AppSheetAction(
          label: l10n.mastermindFleetSnooze,
          icon: LucideIcons.alarmClock,
          value: snooze,
        ),
    ];

    final moreButton = AppIconButton(
      icon: const Icon(LucideIcons.ellipsis),
      tooltip: l10n.mastermindFleetMoreOptions,
      variant: AppButtonVariant.outline,
      onPressed: busy ? null : () => unawaited(_openSheet(context, sheet)),
    );
    if (moreOnly) return moreButton;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (primary != null) ...[
          option(primary, filled: true),
          const SizedBox(height: AppSpacing.sm),
        ],
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (options.isEmpty) ...[
              AppButton.primary(
                loading: sending == FleetAnswerAction.approve,
                enabled: !busy,
                leading: const Icon(LucideIcons.check, size: 16),
                onPressed: () => onAnswer(FleetAnswerAction.approve),
                child: Text(l10n.mastermindFleetApprove),
              ),
              AppButton.outline(
                loading: sending == FleetAnswerAction.hold,
                enabled: !busy,
                leading: const Icon(LucideIcons.pause, size: 16),
                onPressed: () => onAnswer(FleetAnswerAction.hold),
                child: Text(l10n.mastermindFleetHold),
              ),
            ],
            for (final extra in inline) option(extra),
            if (sheet.isNotEmpty) moreButton,
          ],
        ),
      ],
    );
  }

  Future<void> _openSheet(
    BuildContext context,
    List<AppSheetAction<VoidCallback>> actions,
  ) async {
    final picked = await showAppActionSheet<VoidCallback>(
      context: context,
      useRootNavigator: true,
      title: context.l10n.mastermindFleetMoreOptions,
      description: decision.title,
      actions: actions,
    );
    picked?.call();
  }
}
