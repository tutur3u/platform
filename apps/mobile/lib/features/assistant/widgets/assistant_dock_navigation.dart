import 'package:flutter/material.dart';

/// Shell supplies its existing navigation island; Assistant owns the one slot.
/// No widget, builder or BuildContext is retained in presentation state.
class AssistantDockNavigation extends InheritedWidget {
  const AssistantDockNavigation({
    required this.navigation,
    required super.child,
    super.key,
  });

  final Widget navigation;

  static Widget? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<AssistantDockNavigation>()
      ?.navigation;

  @override
  bool updateShouldNotify(AssistantDockNavigation oldWidget) =>
      navigation != oldWidget.navigation;
}
