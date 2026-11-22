import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// A quiet bordered panel for supporting content on a sign-in step.
class AuthSectionCard extends StatelessWidget {
  const AuthSectionCard({
    required this.child,
    this.title,
    this.description,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    super.key,
  });

  final Widget child;
  final String? title;
  final String? description;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return AppCard(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title case final heading?) ...[
            Text(
              heading,
              style: tokens.typography.heading.copyWith(color: c.foreground),
            ),
            if (description case final text?) ...[
              const AppGap(AppSpacing.xs),
              Text(
                text,
                style: tokens.typography.bodySm.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ],
            const AppGap(AppSpacing.md),
          ],
          child,
        ],
      ),
    );
  }
}
