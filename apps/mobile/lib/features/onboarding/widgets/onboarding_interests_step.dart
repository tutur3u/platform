import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_heading.dart';
import 'package:mobile/features/onboarding/data/onboarding_interests.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_choice_card.dart';
import 'package:mobile/l10n/l10n.dart';

/// Step 3, "What brings you here?": six multi-select tiles.
class OnboardingInterestsStep extends StatelessWidget {
  const OnboardingInterestsStep({
    required this.selected,
    required this.onToggle,
    super.key,
  });

  final Set<OnboardingInterest> selected;
  final ValueChanged<OnboardingInterest> onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: AuthHeading(
                title: l10n.onboardingInterestsTitle,
                subtitle: Text(l10n.onboardingInterestsSubtitle),
                centered: false,
                large: true,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            const AppIllustration(AppIllustrationKind.interestScoops, size: 96),
          ],
        ),
        const AppGap(AppSpacing.lg),
        Semantics(
          label: l10n.onboardingInterestsGroup,
          container: true,
          child: LayoutBuilder(
            builder: (context, constraints) {
              const gap = AppSpacing.md - 2;
              final width = (constraints.maxWidth - gap) / 2;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final interest in OnboardingInterest.values)
                    SizedBox(
                      width: width,
                      child: _Tile(
                        interest: interest,
                        selected: selected.contains(interest),
                        onTap: () => onToggle(interest),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.interest,
    required this.selected,
    required this.onTap,
  });

  final OnboardingInterest interest;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final (app, label) = interestLabels(context.l10n, interest);
    final hue = interestHue(
      AppIllustrationPalette.of(context, AppTone.primary).hues,
      interest,
    );
    final radius = tokens.shapes.card;
    return Semantics(
      checked: selected,
      button: true,
      label: '$label, $app',
      excludeSemantics: true,
      child: AppControlTarget(
        key: ValueKey('onboarding-interest-${interest.name}'),
        onTap: onTap,
        radius: radius,
        child: Container(
          constraints: const BoxConstraints(minHeight: 108),
          padding: const EdgeInsets.all(AppSpacing.md + 2),
          decoration: BoxDecoration(
            color: selected ? c.primary.withValues(alpha: 0.06) : c.card,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color: selected ? c.primary : c.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xxs,
                        ),
                        decoration: BoxDecoration(
                          color: hue.fill,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(
                          app,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.typography.caption.copyWith(
                            color: hue.ink,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  OnboardingCheck(on: selected),
                ],
              ),
              const AppGap(AppSpacing.lg),
              Text(
                label,
                style: tokens.typography.ui.copyWith(
                  color: c.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The app chip and tile line of [i].
(String, String) interestLabels(AppLocalizations l10n, OnboardingInterest i) =>
    switch (i) {
      OnboardingInterest.calendar => (
        l10n.onboardingAppCalendar,
        l10n.onboardingInterestCalendar,
      ),
      OnboardingInterest.tasks => (
        l10n.onboardingAppTasks,
        l10n.onboardingInterestTasks,
      ),
      OnboardingInterest.chat => (
        l10n.onboardingAppChat,
        l10n.onboardingInterestChat,
      ),
      OnboardingInterest.education => (
        l10n.onboardingAppEducation,
        l10n.onboardingInterestEducation,
      ),
      OnboardingInterest.finance => (
        l10n.onboardingAppFinance,
        l10n.onboardingInterestFinance,
      ),
      OnboardingInterest.mira => (
        l10n.onboardingAppMira,
        l10n.onboardingInterestMira,
      ),
    };

/// Chip hue of [interest], from the appearance's Sorbet hues.
SorbetHue interestHue(SorbetHues hues, OnboardingInterest interest) =>
    switch (interest) {
      OnboardingInterest.calendar => hues.blue,
      OnboardingInterest.tasks => hues.green,
      OnboardingInterest.chat => hues.orange,
      OnboardingInterest.education => hues.pink,
      OnboardingInterest.finance => hues.gray,
      OnboardingInterest.mira => hues.purple,
    };
