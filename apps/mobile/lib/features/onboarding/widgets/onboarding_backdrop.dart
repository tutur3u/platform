import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Bounded, paint-only brand color; controls retain the theme's solid surfaces.
class OnboardingBackdrop extends StatelessWidget {
  const OnboardingBackdrop({
    required this.page,
    required this.child,
    super.key,
  });

  final int page;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeSemantics(
          child: IgnorePointer(
            child: AnimatedContainer(
              duration: reducedMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 500),
              decoration: BoxDecoration(
                color: theme.colorScheme.background,
                gradient: RadialGradient(
                  center: Alignment(page.isEven ? -.9 : .9, -.8),
                  radius: 1.4,
                  colors: [
                    const Color(0xFF4285F4).withValues(alpha: .18),
                    const Color(0xFF34A853).withValues(alpha: .08),
                    theme.colorScheme.background,
                  ],
                  stops: const [0, .45, 1],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          right: -80,
          bottom: -120,
          width: 360,
          height: 440,
          child: ExcludeSemantics(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      const Color(0xFFEA4335).withValues(alpha: .12),
                      const Color(0xFFFBBC05).withValues(alpha: .06),
                      theme.colorScheme.background.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}
