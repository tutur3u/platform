part of 'education_page.dart';

class _AttemptCard extends StatelessWidget {
  const _AttemptCard({required this.attempt, required this.onTap});

  final EducationAttemptSummary attempt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = attempt.completed
        ? l10n.educationAttemptStatusCompleted
        : l10n.educationAttemptStatusIncomplete;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppGroupedSection(
        children: [
          AppRichRow(
            title: attempt.learnerName ?? attempt.learnerEmail ?? attempt.id,
            subtitle: attempt.setName ?? l10n.educationAttemptsLabel,
            leading: const AppIconTile(icon: LucideIcons.clipboardCheck),
            meta: [
              AppMetaItem(icon: LucideIcons.flag, label: status),
              AppMetaItem(
                icon: LucideIcons.timer,
                label: _formatDuration(attempt.durationSeconds),
              ),
            ],
            trailing: Text(attempt.totalScore.toStringAsFixed(1)),
            onTap: onTap,
          ),
        ],
      ),
    );
  }
}
