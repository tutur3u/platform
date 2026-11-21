import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// The thread's agent state and the machine it runs on.
class ThreadBadges extends StatelessWidget {
  const ThreadBadges({required this.thread, required this.machine, super.key});

  final ProjectThread thread;
  final ProjectsMachine machine;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          AppBadge(
            variant: switch (thread.state) {
              ProjectThreadState.running => AppBadgeVariant.success,
              ProjectThreadState.waiting => AppBadgeVariant.warning,
              ProjectThreadState.failed => AppBadgeVariant.destructive,
              ProjectThreadState.idle => AppBadgeVariant.secondary,
            },
            child: Text(thread.state.describe(l10n)),
          ),
          AppBadge(
            leading: const Icon(LucideIcons.server, size: 12),
            child: Text(machine.display(l10n)),
          ),
        ],
      ),
    );
  }
}
