part of 'education_page.dart';

class _EducationMenu extends StatelessWidget {
  const _EducationMenu({this.onEdit, this.onDelete});

  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppIconButton(
      tooltip: l10n.commonMoreOptions,
      icon: const Icon(LucideIcons.ellipsis),
      onPressed: () {
        unawaited(
          showAppActionSheet<void>(
            context: context,
            title: l10n.commonMoreOptions,
            actions: [
              if (onEdit != null)
                AppSheetAction(
                  label: l10n.commonEdit,
                  icon: LucideIcons.pencil,
                  onPressed: () {
                    Navigator.of(context).pop();
                    onEdit!();
                  },
                ),
              if (onDelete != null)
                AppSheetAction(
                  label: l10n.commonDelete,
                  icon: LucideIcons.trash2,
                  destructive: true,
                  onPressed: () {
                    Navigator.of(context).pop();
                    onDelete!();
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}

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
    final certificate = course.certTemplate;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppGroupedSection(
        children: [
          AppRichRow(
            title: course.name,
            subtitle: course.description,
            leading: const AppIconTile(icon: LucideIcons.graduationCap),
            meta: [
              if (certificate != null && certificate.isNotEmpty)
                AppMetaItem(icon: LucideIcons.badgeCheck, label: certificate),
            ],
            trailing: onEdit == null && onDelete == null
                ? null
                : _EducationMenu(onEdit: onEdit, onDelete: onDelete),
            onTap: onTap,
          ),
          if (course.completionRatio != null)
            EducationCourseMeter(ratio: course.completionRatio),
        ],
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
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppGroupedSection(
        children: [
          AppRichRow(
            title: quizSet.name,
            leading: const AppIconTile(icon: LucideIcons.layers),
            trailing: _EducationMenu(onEdit: onEdit, onDelete: onDelete),
          ),
        ],
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
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    quiz.question,
                    style: tokens.typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                _EducationMenu(onEdit: onEdit, onDelete: onDelete),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final option in quiz.options.take(4))
                  AppBadge(
                    variant: option.isCorrect
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
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppGroupedSection(
        children: [
          AppRichRow(
            title: flashcard.front,
            subtitle: flashcard.back,
            leading: const AppIconTile(icon: LucideIcons.layers),
            trailing: _EducationMenu(onEdit: onEdit, onDelete: onDelete),
          ),
        ],
      ),
    );
  }
}
