part of 'education_page.dart';

class _EducationSummaryTile extends StatelessWidget {
  const _EducationSummaryTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    required this.onTap,
  });

  final String label;
  final int value;
  final IconData icon;
  final Color tint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 168,
      child: FinancePanel(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(height: 14),
            Text(
              NumberFormat.compact().format(value),
              style: shad.Theme.of(
                context,
              ).typography.h3.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EducationBadge extends StatelessWidget {
  const _EducationBadge({
    required this.icon,
    required this.label,
    required this.tint,
  });

  final IconData icon;
  final String label;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tint.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: tint),
          const SizedBox(width: 8),
          Text(
            label,
            style: shad.Theme.of(
              context,
            ).typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _EducationLibraryToggle extends StatelessWidget {
  const _EducationLibraryToggle({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  const _AttemptCard({required this.attempt, required this.onTap});

  final EducationAttemptSummary attempt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tint = attempt.completed
        ? shad.Theme.of(context).colorScheme.primary
        : shad.Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.assignment_turned_in_outlined, color: tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    attempt.learnerName ?? attempt.learnerEmail ?? attempt.id,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    attempt.setName ?? context.l10n.educationAttemptsLabel,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _EducationBadge(
                        icon: Icons.flag_outlined,
                        label: attempt.completed
                            ? context.l10n.educationAttemptStatusCompleted
                            : context.l10n.educationAttemptStatusIncomplete,
                        tint: tint,
                      ),
                      _EducationBadge(
                        icon: Icons.score_outlined,
                        label: attempt.totalScore.toStringAsFixed(1),
                        tint: tint,
                      ),
                      _EducationBadge(
                        icon: Icons.timer_outlined,
                        label: _formatDuration(attempt.durationSeconds),
                        tint: tint,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
