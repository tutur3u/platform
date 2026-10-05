part of 'education_page.dart';

class _AttemptsFilterSheet extends StatefulWidget {
  const _AttemptsFilterSheet({
    required this.sets,
    required this.selectedSetId,
    required this.selectedStatus,
  });

  final List<EducationAttemptFilterSet> sets;
  final String? selectedSetId;
  final String selectedStatus;

  @override
  State<_AttemptsFilterSheet> createState() => _AttemptsFilterSheetState();
}

class _AttemptsFilterSheetState extends State<_AttemptsFilterSheet> {
  late String _status;
  String? _setId;

  @override
  void initState() {
    super.initState();
    _status = widget.selectedStatus;
    _setId = widget.selectedSetId;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.commonFilters,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: InputDecoration(
              labelText: context.l10n.educationAttemptStatusLabel,
            ),
            items: [
              DropdownMenuItem(
                value: 'all',
                child: Text(context.l10n.commonAll),
              ),
              DropdownMenuItem(
                value: 'completed',
                child: Text(context.l10n.educationAttemptStatusCompleted),
              ),
              DropdownMenuItem(
                value: 'incomplete',
                child: Text(context.l10n.educationAttemptStatusIncomplete),
              ),
            ],
            onChanged: (value) => setState(() => _status = value ?? 'all'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _setId,
            decoration: InputDecoration(
              labelText: context.l10n.educationAttemptQuizSetLabel,
            ),
            items: [
              DropdownMenuItem(child: Text(context.l10n.commonAll)),
              ...widget.sets.map(
                (set) => DropdownMenuItem<String?>(
                  value: set.id,
                  child: Text(set.name),
                ),
              ),
            ],
            onChanged: (value) => setState(() => _setId = value),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(
                    context,
                  ).pop({'status': 'all', 'setId': null}),
                  child: Text(context.l10n.educationClearFilters),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => Navigator.of(
                    context,
                  ).pop({'status': _status, 'setId': _setId}),
                  child: Text(context.l10n.commonApply),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttemptDetailSheet extends StatelessWidget {
  const _AttemptDetailSheet({required this.detail});

  final EducationAttemptDetail detail;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ListView(
        children: [
          Text(
            detail.learner?.fullName ??
                detail.learner?.email ??
                detail.attempt.id,
            style: shad.Theme.of(
              context,
            ).typography.h3.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _EducationBadge(
                icon: Icons.score_outlined,
                label: detail.attempt.totalScore.toStringAsFixed(1),
                tint: shad.Theme.of(context).colorScheme.primary,
              ),
              _EducationBadge(
                icon: Icons.timer_outlined,
                label: _formatDuration(detail.attempt.durationSeconds),
                tint: shad.Theme.of(context).colorScheme.primary,
              ),
            ],
          ),
          const SizedBox(height: 20),
          ...detail.answers.map(
            (answer) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: FinancePanel(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      answer.question ?? answer.quizId,
                      style: shad.Theme.of(
                        context,
                      ).typography.large.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    if (answer.selectedOptionValue != null)
                      Text(
                        answer.selectedOptionValue!,
                        style: shad.Theme.of(context).typography.textSmall,
                      ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: answer.options
                          .map(
                            (option) => _EducationBadge(
                              icon: option.isCorrect
                                  ? Icons.check_circle_outline_rounded
                                  : Icons.radio_button_unchecked_rounded,
                              label: option.value,
                              tint: option.id == answer.selectedOptionId
                                  ? shad.Theme.of(context).colorScheme.primary
                                  : option.isCorrect
                                  ? shad.Theme.of(context).colorScheme.primary
                                  : shad.Theme.of(context).colorScheme.primary,
                            ),
                          )
                          .toList(growable: false),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
