import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class GoalsEmptyState extends StatelessWidget {
  const GoalsEmptyState({required this.onCreatePressed, super.key});

  final VoidCallback? onCreatePressed;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppStateMessage(
      icon: LucideIcons.goal,
      title: l10n.timerGoalsEmptyTitle,
      message: l10n.timerGoalsEmptyDescription,
      actionLabel: l10n.timerGoalsCreate,
      onAction: onCreatePressed,
    );
  }
}
