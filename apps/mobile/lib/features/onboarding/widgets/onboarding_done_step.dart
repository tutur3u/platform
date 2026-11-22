import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Where an "All set" row leads.
enum OnboardingNextStep { task, calendar, notifications }

/// The closing screen: "You're all set", three next steps and the app.
class OnboardingDoneStep extends StatelessWidget {
  const OnboardingDoneStep({
    required this.name,
    required this.workspaceName,
    required this.onNext,
    super.key,
  });

  final String? name;
  final String? workspaceName;
  final ValueChanged<OnboardingNextStep> onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final hues = AppIllustrationPalette.of(context, AppTone.primary).hues;
    final first = name?.trim().split(RegExp(r'\s+')).first;
    final title = first == null || first.isEmpty
        ? l10n.onboardingDoneTitleNoName
        : l10n.onboardingDoneTitle(first);
    final rows = [
      (OnboardingNextStep.task, LucideIcons.check, hues.green),
      (OnboardingNextStep.calendar, LucideIcons.calendar, hues.blue),
      (OnboardingNextStep.notifications, LucideIcons.bell, hues.orange),
    ];
    return Column(
      children: [
        const AppIllustration(AppIllustrationKind.allSetBowl, size: 240),
        const AppGap(AppSpacing.lg),
        Semantics(
          header: true,
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: tokens.typography.display.copyWith(
              color: c.foreground,
              fontSize: 30,
              height: 36 / 30,
            ),
          ),
        ),
        if (workspaceName case final workspace? when workspace.isNotEmpty) ...[
          const AppGap(AppSpacing.xs + 2),
          Text(
            l10n.onboardingDoneSubtitle(workspace),
            textAlign: TextAlign.center,
            style: tokens.typography.body.copyWith(color: c.mutedForeground),
          ),
        ],
        const AppGap(AppSpacing.xl),
        for (final (step, icon, hue) in rows) ...[
          _NextRow(
            step: step,
            icon: icon,
            hue: hue,
            label: switch (step) {
              OnboardingNextStep.task => l10n.onboardingNextTask,
              OnboardingNextStep.calendar => l10n.onboardingNextCalendar,
              OnboardingNextStep.notifications =>
                l10n.onboardingNextNotifications,
            },
            onTap: () => onNext(step),
          ),
          const AppGap(AppSpacing.sm),
        ],
      ],
    );
  }
}

class _NextRow extends StatelessWidget {
  const _NextRow({
    required this.step,
    required this.icon,
    required this.hue,
    required this.label,
    required this.onTap,
  });

  final OnboardingNextStep step;
  final IconData icon;
  final SorbetHue hue;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final radius = tokens.shapes.card;
    return Semantics(
      link: true,
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppControlTarget(
        key: ValueKey('onboarding-next-${step.name}'),
        onTap: onTap,
        radius: radius,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: c.border),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: hue.calm,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(icon, size: 18, color: hue.ink),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  label,
                  style: tokens.typography.ui.copyWith(
                    color: c.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: c.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
