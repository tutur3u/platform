import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Course facts the API actually returns. There is no learner progress, so
/// this sheet does not invent a completion meter.
class EducationCourseDetail extends StatelessWidget {
  const EducationCourseDetail({required this.course, super.key});

  final EducationCourse course;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final description = course.description?.trim();
    return AppSheetScaffold(
      title: course.name.trim().isEmpty
          ? l10n.educationCoursesLabel
          : course.name,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppMetaItem(
            icon: LucideIcons.layers,
            label: l10n.educationCourseModules(course.modulesCount),
          ),
          if (description != null && description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(description, style: AppTokens.of(context).typography.body),
          ],
        ],
      ),
    );
  }
}
