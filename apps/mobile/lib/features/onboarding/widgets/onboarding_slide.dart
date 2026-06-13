import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class OnboardingSlide extends StatelessWidget {
  const OnboardingSlide({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.accentColor,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final hPadding = ResponsivePadding.horizontal(context.deviceClass);

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: hPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: (accentColor ?? theme.colorScheme.primary).withValues(
                alpha: 0.1,
              ),
            ),
            child: Icon(
              icon,
              size: 64,
              color: accentColor ?? theme.colorScheme.primary,
            ),
          ),
          const shad.Gap(40),
          Text(
            title,
            style: theme.typography.h2.copyWith(fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
          const shad.Gap(16),
          Text(
            subtitle,
            style: theme.typography.lead.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
