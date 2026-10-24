import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// App-wide override for shad's destructive button.
///
/// The library paints a fixed white label on a 50% destructive fill, which
/// falls to about 2.5:1 on light pages. This uses the theme's solid
/// destructive colour (already AA against every page background) with the
/// near-white or near-black label that reads best on it.
const accessibleDestructiveButtonTheme = shad.DestructiveButtonTheme(
  decoration: _decoration,
  textStyle: _textStyle,
  iconTheme: _iconTheme,
);

bool _disabled(Set<WidgetState> states) =>
    states.contains(WidgetState.disabled);

Color _fill(BuildContext context, Set<WidgetState> states) {
  final destructive = shad.Theme.of(context).colorScheme.destructive;
  if (!states.contains(WidgetState.hovered) &&
      !states.contains(WidgetState.pressed)) {
    return destructive;
  }
  // A slight shift toward the label marks hover/press without losing AA.
  return Color.lerp(destructive, AppearanceTheme.labelOn(destructive), 0.08)!;
}

Decoration _decoration(
  BuildContext context,
  Set<WidgetState> states,
  Decoration value,
) {
  if (_disabled(states) || value is! BoxDecoration) return value;
  return value.copyWith(color: _fill(context, states));
}

TextStyle _textStyle(
  BuildContext context,
  Set<WidgetState> states,
  TextStyle value,
) {
  if (_disabled(states)) return value;
  final destructive = shad.Theme.of(context).colorScheme.destructive;
  return value.copyWith(color: AppearanceTheme.labelOn(destructive));
}

IconThemeData _iconTheme(
  BuildContext context,
  Set<WidgetState> states,
  IconThemeData value,
) {
  if (_disabled(states)) return value;
  final destructive = shad.Theme.of(context).colorScheme.destructive;
  return value.copyWith(color: AppearanceTheme.labelOn(destructive));
}
