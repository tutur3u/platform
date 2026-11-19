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
  static const _allSets = '';

  late String _status;
  late String _setId;

  @override
  void initState() {
    super.initState();
    _status = widget.selectedStatus;
    _setId = widget.selectedSetId ?? _allSets;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.commonFilters,
      actions: [
        AppButton.ghost(
          onPressed: () =>
              Navigator.of(context).pop({'status': 'all', 'setId': null}),
          child: Text(l10n.educationClearFilters),
        ),
        AppButton.primary(
          onPressed: () => Navigator.of(
            context,
          ).pop({'status': _status, 'setId': _setId.isEmpty ? null : _setId}),
          child: Text(l10n.commonApply),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppSelect<String>(
            title: l10n.educationAttemptStatusLabel,
            value: _status,
            options: [
              AppSelectOption(value: 'all', label: l10n.commonAll),
              AppSelectOption(
                value: 'completed',
                label: l10n.educationAttemptStatusCompleted,
              ),
              AppSelectOption(
                value: 'incomplete',
                label: l10n.educationAttemptStatusIncomplete,
              ),
            ],
            onChanged: (value) => setState(() => _status = value),
          ),
          const SizedBox(height: AppSpacing.md),
          AppSelect<String>(
            title: l10n.educationAttemptQuizSetLabel,
            value: _setId,
            options: [
              AppSelectOption(value: _allSets, label: l10n.commonAll),
              for (final set in widget.sets)
                AppSelectOption(value: set.id, label: set.name),
            ],
            onChanged: (value) => setState(() => _setId = value),
          ),
        ],
      ),
    );
  }
}

class _AttemptDetailBody extends StatelessWidget {
  const _AttemptDetailBody({required this.detail});

  final EducationAttemptDetail detail;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            AppBadge(
              leading: const Icon(LucideIcons.star, size: 14),
              child: Text(detail.attempt.totalScore.toStringAsFixed(1)),
            ),
            AppBadge.outline(
              leading: const Icon(LucideIcons.timer, size: 14),
              child: Text(_formatDuration(detail.attempt.durationSeconds)),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        for (final answer in detail.answers) ...[
          AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  answer.question ?? answer.quizId,
                  style: tokens.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (answer.selectedOptionValue != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    answer.selectedOptionValue!,
                    style: tokens.typography.textSmall,
                  ),
                ],
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final option in answer.options)
                      AppBadge(
                        variant: option.id == answer.selectedOptionId
                            ? AppBadgeVariant.primary
                            : AppBadgeVariant.outline,
                        leading: Icon(
                          option.isCorrect
                              ? LucideIcons.circleCheck
                              : LucideIcons.circle,
                          size: 14,
                        ),
                        child: Text(option.value),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ],
    );
  }
}
