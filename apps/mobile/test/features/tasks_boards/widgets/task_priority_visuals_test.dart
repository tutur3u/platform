import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  test('levels follow the web order, icons and dynamic colours', () {
    // packages/tasks-ui/src/tu-do/utils/taskPriorityUtils.tsx and
    // PRIORITY_BADGE_COLORS in taskConstants.ts.
    expect(TaskPriorityLevel.values.map((level) => level.value), [
      'critical',
      'high',
      'normal',
      'low',
    ]);
    expect(TaskPriorityLevel.values.map((level) => level.icon), [
      LucideLabIcons.unicornHead,
      LucideLabIcons.horseHead,
      LucideIcons.rabbit,
      LucideIcons.turtle,
    ]);
    for (final brightness in Brightness.values) {
      final palette = DynamicColors.forBrightness(brightness);
      expect(TaskPriorityLevel.values.map((level) => level.color(palette)), [
        palette.red,
        palette.orange,
        palette.yellow,
        palette.blue,
      ]);
    }
  });

  test('parses stored values and rejects unknown ones', () {
    expect(TaskPriorityLevel.tryParse(' High '), TaskPriorityLevel.high);
    expect(TaskPriorityLevel.tryParse('urgent'), isNull);
    expect(TaskPriorityLevel.tryParse(null), isNull);
  });

  test('labels match the web wording in English and Vietnamese', () async {
    final en = await AppLocalizations.delegate.load(const Locale('en'));
    final vi = await AppLocalizations.delegate.load(const Locale('vi'));
    expect(TaskPriorityLevel.values.map((level) => level.label(en)), [
      'Critical',
      'High',
      'Normal',
      'Low',
    ]);
    expect(TaskPriorityLevel.values.map((level) => level.label(vi)), [
      'Khẩn cấp',
      'Cao',
      'Bình thường',
      'Thấp',
    ]);
  });
}
