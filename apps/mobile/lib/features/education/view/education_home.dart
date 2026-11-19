import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Learner home: one continue row, course progress facts, practice and
/// recent attempts. Counts stay in [AppStatStrip] instead of large tiles.
class EducationHome extends StatelessWidget {
  const EducationHome({
    required this.workspaceId,
    required this.courses,
    required this.courseCount,
    required this.quizCount,
    required this.quizSetCount,
    required this.flashcardCount,
    required this.attemptCount,
    required this.attempts,
    required this.onOpenCourse,
    required this.onOpenQuizzes,
    required this.onOpenQuizSets,
    required this.onOpenFlashcards,
    required this.onOpenAttempt,
    required this.onSeeCourses,
    required this.onSeeAttempts,
    super.key,
  });

  final String workspaceId;
  final List<EducationCourse> courses;
  final int courseCount;
  final int quizCount;
  final int quizSetCount;
  final int flashcardCount;
  final int attemptCount;
  final List<EducationAttemptSummary> attempts;
  final ValueChanged<EducationCourse> onOpenCourse;
  final VoidCallback onOpenQuizzes;
  final VoidCallback onOpenQuizSets;
  final VoidCallback onOpenFlashcards;
  final ValueChanged<EducationAttemptSummary> onOpenAttempt;
  final VoidCallback onSeeCourses;
  final VoidCallback onSeeAttempts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final continueCourse = courses.isEmpty ? null : courses.first;
    final moreCourses = courses.length <= 1
        ? const <EducationCourse>[]
        : courses.sublist(1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppStatStrip(
          items: [
            AppStatStripItem(
              label: l10n.educationCoursesLabel,
              value: '$courseCount',
              onTap: onSeeCourses,
            ),
            AppStatStripItem(
              label: l10n.educationLibraryQuizzesLabel,
              value: '$quizCount',
              onTap: onOpenQuizzes,
            ),
            AppStatStripItem(
              label: l10n.educationLibraryFlashcardsLabel,
              value: '$flashcardCount',
              onTap: onOpenFlashcards,
            ),
            AppStatStripItem(
              label: l10n.educationAttemptsLabel,
              value: '$attemptCount',
              onTap: onSeeAttempts,
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        if (continueCourse != null) ...[
          AppSectionHeader(title: l10n.educationContinueLearning),
          _syncedCourse(continueCourse),
        ] else
          AppStateMessage.inline(
            icon: LucideIcons.graduationCap,
            title: l10n.educationCoursesLabel,
            message: l10n.educationEmptyCourses,
          ),
        if (moreCourses.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          AppSectionHeader(
            title: l10n.educationOverviewRecentCoursesTitle,
            actionLabel: l10n.homeSeeAll,
            onAction: onSeeCourses,
          ),
          for (final course in moreCourses) _syncedCourse(course),
        ],
        const SizedBox(height: AppSpacing.lg),
        AppSectionHeader(title: l10n.educationPracticeTitle),
        AppRichRow(
          title: l10n.educationLibraryQuizzesLabel,
          subtitle: quizCount == 0 ? l10n.educationEmptyQuizzes : null,
          leading: const AppIconTile(icon: LucideIcons.listChecks),
          trailing: Text('$quizCount'),
          onTap: onOpenQuizzes,
        ),
        AppRichRow(
          title: l10n.educationLibraryQuizSetsLabel,
          subtitle: quizSetCount == 0 ? l10n.educationEmptyQuizSets : null,
          leading: const AppIconTile(icon: LucideIcons.library),
          trailing: Text('$quizSetCount'),
          onTap: onOpenQuizSets,
        ),
        AppRichRow(
          title: l10n.educationLibraryFlashcardsLabel,
          subtitle: flashcardCount == 0 ? l10n.educationEmptyFlashcards : null,
          leading: const AppIconTile(icon: LucideIcons.layers),
          trailing: Text('$flashcardCount'),
          onTap: onOpenFlashcards,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppSectionHeader(
          title: l10n.educationOverviewRecentAttemptsTitle,
          actionLabel: attempts.isEmpty ? null : l10n.homeSeeAll,
          onAction: attempts.isEmpty ? null : onSeeAttempts,
        ),
        if (attempts.isEmpty)
          AppStateMessage.inline(
            icon: LucideIcons.clipboardCheck,
            title: l10n.educationAttemptsLabel,
            message: l10n.educationEmptyAttempts,
          )
        else
          for (final attempt in attempts)
            AppRichRow(
              title: attempt.learnerName ?? attempt.learnerEmail ?? attempt.id,
              subtitle: attempt.setName ?? l10n.educationAttemptsLabel,
              leading: const AppIconTile(icon: LucideIcons.clipboardCheck),
              meta: [
                AppMetaItem(
                  label: attempt.completed
                      ? l10n.educationAttemptStatusCompleted
                      : l10n.educationAttemptStatusIncomplete,
                ),
              ],
              trailing: Text(attempt.totalScore.toStringAsFixed(1)),
              onTap: () => onOpenAttempt(attempt),
            ),
      ],
    );
  }

  Widget _syncedCourse(EducationCourse course) {
    return PendingSyncFrame(
      workspaceId: workspaceId,
      entityId: course.id,
      feature: 'education',
      child: _CourseRow(course: course, onTap: onOpenCourse),
    );
  }
}

class _CourseRow extends StatelessWidget {
  const _CourseRow({required this.course, required this.onTap});

  final EducationCourse course;
  final ValueChanged<EducationCourse> onTap;

  @override
  Widget build(BuildContext context) {
    return AppRichRow(
      title: course.name,
      subtitle: course.description,
      leading: const AppIconTile(
        icon: LucideIcons.graduationCap,
        tone: AppTone.primary,
      ),
      meta: [
        AppMetaItem(
          icon: LucideIcons.layers,
          label: context.l10n.educationCourseModules(course.modulesCount),
        ),
      ],
      onTap: () => onTap(course),
    );
  }
}
