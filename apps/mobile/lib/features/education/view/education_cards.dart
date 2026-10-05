part of 'education_page.dart';

class _CourseCard extends StatelessWidget {
  const _CourseCard({
    required this.course,
    this.onTap,
    this.onEdit,
    this.onDelete,
  });

  final EducationCourse course;
  final VoidCallback? onTap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
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
                color: shad.Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                Icons.school_outlined,
                color: shad.Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course.name,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w800),
                  ),
                  if (course.description?.isNotEmpty ?? false) ...[
                    const SizedBox(height: 4),
                    Text(
                      course.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: shad.Theme.of(context).typography.textSmall
                          .copyWith(
                            color: shad.Theme.of(
                              context,
                            ).colorScheme.mutedForeground,
                          ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _EducationBadge(
                        icon: Icons.layers_outlined,
                        label: '${course.modulesCount}',
                        tint: shad.Theme.of(context).colorScheme.primary,
                      ),
                      if (course.certTemplate?.isNotEmpty ?? false)
                        _EducationBadge(
                          icon: Icons.verified_outlined,
                          label: course.certTemplate!,
                          tint: shad.Theme.of(context).colorScheme.primary,
                        ),
                    ],
                  ),
                ],
              ),
            ),
            if (onEdit != null || onDelete != null)
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'edit') onEdit?.call();
                  if (value == 'delete') onDelete?.call();
                },
                itemBuilder: (context) => [
                  if (onEdit != null)
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                  if (onDelete != null)
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _QuizSetCard extends StatelessWidget {
  const _QuizSetCard({required this.quizSet, this.onEdit, this.onDelete});

  final EducationQuizSet quizSet;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: shad.Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                Icons.layers_outlined,
                color: shad.Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    quizSet.name,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  _EducationBadge(
                    icon: Icons.link_outlined,
                    label: '${quizSet.linkedModulesCount}',
                    tint: shad.Theme.of(context).colorScheme.primary,
                  ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (value) {
                if (value == 'edit') onEdit?.call();
                if (value == 'delete') onDelete?.call();
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'edit',
                  child: Text(context.l10n.commonEdit),
                ),
                PopupMenuItem(
                  value: 'delete',
                  child: Text(context.l10n.commonDelete),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard({required this.quiz, this.onEdit, this.onDelete});

  final EducationQuiz quiz;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    quiz.question,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') onEdit?.call();
                    if (value == 'delete') onDelete?.call();
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...quiz.options
                .take(4)
                .map(
                  (option) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _EducationBadge(
                      icon: option.isCorrect
                          ? Icons.check_circle_outline_rounded
                          : Icons.radio_button_unchecked_rounded,
                      label: option.value,
                      tint: option.isCorrect
                          ? shad.Theme.of(context).colorScheme.primary
                          : shad.Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _FlashcardCard extends StatelessWidget {
  const _FlashcardCard({required this.flashcard, this.onEdit, this.onDelete});

  final EducationFlashcard flashcard;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    flashcard.front,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') onEdit?.call();
                    if (value == 'delete') onDelete?.call();
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              flashcard.back,
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
