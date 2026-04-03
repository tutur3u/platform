import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AuthSectionCard extends StatelessWidget {
  const AuthSectionCard({
    required this.child,
    this.title,
    this.description,
    this.padding = const EdgeInsets.all(20),
    super.key,
  });

  final Widget child;
  final String? title;
  final String? description;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.9),
        ),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.foreground.withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Text(
                title!,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (description != null) ...[
                const shad.Gap(6),
                Text(
                  description!,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    height: 1.35,
                  ),
                ),
              ],
              const shad.Gap(16),
            ],
            child,
          ],
        ),
      ),
    );
  }
}
