import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// A growing prompt field between icon controls, as in a chat composer.
///
/// With one line, the text and every control share the vertical centre of
/// [minHeight]. Extra lines grow the field upward while the controls stay
/// centred on the last line instead of drifting to the middle of a long draft.
/// Pad the field with [fieldPadding] so its last line sits where the controls
/// are centred.
class AppComposerRow extends StatelessWidget {
  const AppComposerRow({
    required this.minHeight,
    required this.field,
    this.leading = const [],
    this.trailing = const [],
    super.key,
  });

  final double minHeight;
  final Widget field;
  final List<Widget> leading;
  final List<Widget> trailing;

  /// The rendered height of one line of [style] under the ambient scaler.
  static double lineHeightOf(BuildContext context, TextStyle style) =>
      MediaQuery.textScalerOf(context).scale(style.fontSize ?? 14) *
      (style.height ?? 1.2);

  /// Vertical field padding that centres one [lineHeight] line in
  /// [minHeight].
  static EdgeInsets fieldPadding({
    required double minHeight,
    required double lineHeight,
  }) =>
      EdgeInsets.symmetric(vertical: math.max(0, (minHeight - lineHeight) / 2));

  Widget _control(Widget child) => SizedBox(
    height: minHeight,
    child: Center(child: child),
  );

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      ...leading.map(_control),
      Expanded(
        child: Container(
          constraints: BoxConstraints(minHeight: minHeight),
          alignment: Alignment.center,
          child: field,
        ),
      ),
      ...trailing.map(_control),
    ],
  );
}
