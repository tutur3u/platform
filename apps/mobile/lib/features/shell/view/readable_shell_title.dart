import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/shell_title_text_style.dart';

/// Retain a painted prefix when an ellipsis would remove every title glyph.
/// Full text remains available to semantics; ordinary ellipsis is unchanged.
class ReadableShellTitle extends StatelessWidget {
  const ReadableShellTitle(this.title, {this.style, super.key});

  final String title;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final effectiveStyle = effectiveShellTitleStyle(context, style: style);
      final painter = TextPainter(
        text: TextSpan(text: title, style: effectiveStyle),
        textScaler: MediaQuery.textScalerOf(context),
        textDirection: Directionality.of(context),
        locale: Localizations.maybeLocaleOf(context),
        textAlign: DefaultTextStyle.of(context).textAlign ?? TextAlign.start,
        textWidthBasis: DefaultTextStyle.of(context).textWidthBasis,
        textHeightBehavior:
            DefaultTextStyle.of(context).textHeightBehavior ??
            DefaultTextHeightBehavior.maybeOf(context),
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: constraints.maxWidth);
      final hasTitleGlyph =
          title.isEmpty ||
          painter
              .getBoxesForSelection(
                TextSelection(
                  baseOffset: 0,
                  extentOffset: title.characters.first.length,
                ),
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
