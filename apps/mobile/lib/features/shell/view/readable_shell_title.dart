import 'package:flutter/material.dart';

/// Retain a painted prefix when an ellipsis would remove every title glyph.
/// Full text remains available to semantics; ordinary ellipsis is unchanged.
class ReadableShellTitle extends StatelessWidget {
  const ReadableShellTitle(this.title, {this.style, super.key});

  final String title;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final effectiveStyle = DefaultTextStyle.of(context).style.merge(style);
      final painter = TextPainter(
        text: TextSpan(text: title, style: effectiveStyle),
        textScaler: MediaQuery.textScalerOf(context),
        textDirection: Directionality.of(context),
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: constraints.maxWidth);
      final hasTitleGlyph =
          title.isEmpty ||
          painter
              .getBoxesForSelection(
                const TextSelection(baseOffset: 0, extentOffset: 1),
              )
              .isNotEmpty;
      painter.dispose();
      return Text(
        title,
        maxLines: 1,
        overflow: hasTitleGlyph ? TextOverflow.ellipsis : TextOverflow.clip,
        style: style,
      );
    },
  );
}
