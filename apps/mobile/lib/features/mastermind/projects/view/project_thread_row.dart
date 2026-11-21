import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// One thread: state dot, title, machine (and project in a flat list), age
/// and unread count. No provider, model or nesting.
class ProjectThreadRow extends StatelessWidget {
  const ProjectThreadRow({
    required this.thread,
    required this.machineLabel,
    required this.onTap,
    required this.now,
    this.showProject = false,
    super.key,
  });

  final ProjectThread thread;
  final String machineLabel;
  final bool showProject;
  final VoidCallback onTap;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final muted = text.bodySmall?.copyWith(color: colors.mutedForeground);
    final project = thread.project;
    final subtitle = [
      machineLabel,
      if (showProject && project != null && project.isNotEmpty) project,
    ].join(' · ');
    return Semantics(
      button: true,
      label: '${thread.title}, ${thread.state.describe(l10n)}',
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 16, 8),
          child: Row(
            children: [
              ProjectStateDot(state: thread.state),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      thread.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: muted,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(fleetAge(l10n, thread.updatedAt, now), style: muted),
                  _Unread(thread: thread),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProjectStateDot extends StatelessWidget {
  const ProjectStateDot({required this.state, super.key});

  final ProjectThreadState state;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: 8,
    child: DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: state.tone.foreground(AppTokens.of(context).colorScheme),
      ),
    ),
  );
}

class _Unread extends StatelessWidget {
  const _Unread({required this.thread});

  final ProjectThread thread;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final unread = thread.unread;
    if (unread == 0) return const SizedBox.shrink();
    final colors = AppTokens.of(context).colorScheme;
    final label = unread == null ? l10n.mastermindProjectsNew : '$unread';
    return Semantics(
      label: unread == null ? label : l10n.mastermindProjectsUnread(unread),
      excludeSemantics: true,
      child: Container(
        margin: const EdgeInsets.only(top: 2),
        constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
        padding: const EdgeInsets.symmetric(horizontal: 5),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.primary,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: colors.primaryForeground,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
