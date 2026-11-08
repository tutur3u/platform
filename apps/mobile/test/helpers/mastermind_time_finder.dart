import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// A Mastermind time label whose visible words, clock glyph aside, are
/// exactly [text]: "2m", "Live 1d", "Updated 3h".
Finder findTimeLabel(String text) => find.byWidgetPredicate(
  (widget) =>
      widget is Text &&
      widget.textSpan != null &&
      widget.textSpan!.toPlainText(includePlaceholders: false) == text,
  description: 'time label "$text"',
);
