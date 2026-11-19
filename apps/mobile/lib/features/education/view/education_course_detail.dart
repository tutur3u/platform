import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Course facts plus the learner completion meter when progress loaded.
class EducationCourseDetail extends StatelessWidget {
  const EducationCourseDetail({
    required this.course,
    this.onPractice,
    super.key,
  });

  final EducationCourse course;
  final VoidCallback? onPractice;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final description = course.description?.trim();
    return AppSheetScaffold(
      title: course.name.trim().isEmpty
          ? l10n.educationCoursesLabel
          : course.name,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppMetaItem(
            icon: LucideIcons.layers,
            label: l10n.educationCourseModules(course.modulesCount),
          ),
          EducationCourseMeter(ratio: course.completionRatio, inset: false),
          if (description != null && description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(description, style: AppTokens.of(context).typography.body),
          ],
          if (onPractice != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton.primary(
              onPressed: onPractice,
              child: Text(l10n.educationPracticeTitle),
            ),
          ],
        ],
      ),
    );
  }
}

/// Completion bar for a course. Hidden until [ratio] is known, including when
/// the progress request failed. A ratio of zero still draws an empty meter.
class EducationCourseMeter extends StatelessWidget {
  const EducationCourseMeter({
    required this.ratio,
    this.inset = true,
    super.key,
  });

  final double? ratio;
  final bool inset;

  @override
  Widget build(BuildContext context) {
    final ratio = this.ratio;
    if (ratio == null) return const SizedBox.shrink();
    final percent = (ratio.clamp(0, 1) * 100).round();
    final label = context.l10n.educationCourseCompletion(percent);
    final tokens = AppTokens.of(context);
    return Padding(
      padding: inset
          ? const EdgeInsets.fromLTRB(
              AppLayout.rowHorizontalPadding,
              0,
              AppLayout.rowHorizontalPadding,
              AppSpacing.sm,
            )
          : const EdgeInsets.only(top: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppMeter(value: ratio, semanticLabel: label),
          const SizedBox(height: AppSpacing.xs),
          Text(
            label,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}
