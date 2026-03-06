import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class GoalsEmptyState extends StatelessWidget {
  const GoalsEmptyState({required this.onCreatePressed, super.key});

  final VoidCallback? onCreatePressed;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(
              shad.LucideIcons.goal,
              color: theme.colorScheme.mutedForeground,
            ),
            const shad.Gap(8),
            Text(l10n.timerGoalsEmptyTitle),
            const shad.Gap(4),
            Text(
              l10n.timerGoalsEmptyDescription,
              textAlign: TextAlign.center,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(12),
            shad.PrimaryButton(
              onPressed: onCreatePressed,
              child: Text(l10n.timerGoalsCreate),
            ),
          ],
        ),
      ),
    );
  }
}
