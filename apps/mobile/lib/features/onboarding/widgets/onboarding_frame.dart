import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Frame of an onboarding step: a full-screen flow above the shell.
///
/// The header shows "Step n of 3", a progress bar per step and Skip; the
/// [action] stays pinned above the keyboard while [child] scrolls. The last
/// screen passes no [step] and shows no header.
class OnboardingFrame extends StatelessWidget {
  const OnboardingFrame({
    required this.child,
    required this.action,
    this.step,
    this.total = 3,
    this.onSkip,
    super.key,
  });

  final Widget child;
  final Widget action;

  /// One-based step number, or null for a screen outside the steps.
  final int? step;
  final int total;
  final VoidCallback? onSkip;

  /// Widest the column grows on tablets.
  static const maxWidth = 480.0;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Scaffold(
      backgroundColor: c.background,
      resizeToAvoidBottomInset: true,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: c.isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: maxWidth),
              child: Column(
                children: [
                  if (step case final current?)
                    _StepHeader(step: current, total: total, onSkip: onSkip),
                  Expanded(
                    child: SingleChildScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        step == null ? AppSpacing.xxl : AppSpacing.md,
                        AppSpacing.lg,
                        AppSpacing.md,
                      ),
                      child: child,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.sm,
                      AppSpacing.lg,
                      AppSpacing.md,
                    ),
                    child: SizedBox(width: double.infinity, child: action),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({
    required this.step,
    required this.total,
    required this.onSkip,
  });

  final int step;
  final int total;
  final VoidCallback? onSkip;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final label = context.l10n.connectedOnboardingStep(step, total);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.lg,
        AppSpacing.xs,
        AppSpacing.sm,
        0,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              label: label,
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: tokens.typography.caption.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                    const AppGap(AppSpacing.xs + 2),
                    SizedBox(
                      width: 140,
                      child: Row(
                        children: [
                          for (var i = 1; i <= total; i++) ...[
                            if (i > 1) const SizedBox(width: AppSpacing.xs),
                            Expanded(
                              child: Container(
                                height: 4,
                                decoration: BoxDecoration(
                                  color: i <= step ? c.primary : c.muted,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          AppButton(
            variant: AppButtonVariant.ghost,
            size: AppButtonSize.small,
            onPressed: onSkip,
            child: Text(context.l10n.onboardingSkip),
          ),
        ],
      ),
    );
  }
}
