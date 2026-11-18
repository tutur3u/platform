import 'package:flutter/foundation.dart' show immutable;

/// Column geometry shared by the day strip and the body, so every bar lines
/// up with the day it spans.
@immutable
class TaskTimelineMetrics {
  const TaskTimelineMetrics({
    required this.width,
    required this.inset,
    required this.days,
  });

  /// Full width of the strip and body.
  final double width;

  /// Side inset before the first and after the last column.
  final double inset;

  /// Column count.
  final int days;

  double get columnWidth => days == 0 ? 0 : (width - inset * 2) / days;

  /// Left edge of [column].
  double left(int column) => inset + column * columnWidth;

  /// Horizontal centre of [column].
  double centre(int column) => left(column) + columnWidth / 2;

  /// The column under [dx], or null outside the columns.
  int? columnAt(double dx) {
    if (columnWidth <= 0) return null;
    final column = ((dx - inset) / columnWidth).floor();
    return column < 0 || column >= days ? null : column;
  }

  @override
  bool operator ==(Object other) =>
      other is TaskTimelineMetrics &&
      other.width == width &&
      other.inset == inset &&
      other.days == days;

  @override
  int get hashCode => Object.hash(width, inset, days);
}
