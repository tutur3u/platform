import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/ui.dart';

/// Round check mark of a choice: filled with a tick when [on].
class OnboardingCheck extends StatelessWidget {
  const OnboardingCheck({required this.on, super.key});

  final bool on;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 160),
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: on ? c.primary : Colors.transparent,
        border: Border.all(color: on ? c.primary : c.border, width: 1.5),
      ),
      child: on
          ? Icon(LucideIcons.check, size: 14, color: c.primaryForeground)
          : null,
    );
  }
}

/// A selectable card: check, title and subtitle, and an optional [expanded]
/// part shown under them while selected (the workspace name field).
class OnboardingChoiceCard extends StatelessWidget {
  const OnboardingChoiceCard({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.expanded,
    super.key,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;
  final Widget? expanded;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final radius = tokens.shapes.card;
    final header = Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: AppControlTarget(
        onTap: onTap,
        radius: radius,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              OnboardingCheck(on: selected),
              const SizedBox(width: AppSpacing.md + 2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: tokens.typography.ui.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const AppGap(AppSpacing.xxs),
                    Text(
                      subtitle,
                      style: tokens.typography.caption.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: selected ? c.primary.withValues(alpha: 0.06) : c.card,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: selected ? c.primary : c.border,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          header,
          if (selected && expanded != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.lg,
              ),
              child: expanded,
            ),
        ],
      ),
    );
  }
}
