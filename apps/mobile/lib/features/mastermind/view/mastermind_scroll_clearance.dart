import 'package:flutter/widgets.dart';

/// Retains shell padding before page scrollables consume it, for modal routes.
class MastermindScrollClearance extends InheritedWidget {
  const MastermindScrollClearance({
    required this.bottom,
    required super.child,
    super.key,
  });

  final double bottom;

  static double of(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<MastermindScrollClearance>()
          ?.bottom ??
      MediaQuery.paddingOf(context).bottom;

  @override
  bool updateShouldNotify(MastermindScrollClearance oldWidget) =>
      bottom != oldWidget.bottom;
}
