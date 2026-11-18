import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/task_board_list.dart';

/// The theme colour of a board list's stored colour name; unknown names and
/// null use gray.
Color taskBoardListColor(BuildContext context, String? color) {
  final palette = context.dynamicColors;
  return switch (TaskBoardList.normalizeSupportedColor(color) ?? 'GRAY') {
    'RED' => palette.red,
    'BLUE' => palette.blue,
    'GREEN' => palette.green,
    'YELLOW' => palette.yellow,
    'ORANGE' => palette.orange,
    'PURPLE' => palette.purple,
    'PINK' => palette.pink,
    'INDIGO' => palette.indigo,
    'CYAN' => palette.cyan,
    _ => palette.gray,
  };
}
