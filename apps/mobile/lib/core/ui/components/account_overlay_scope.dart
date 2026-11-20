import 'package:flutter/widgets.dart';

/// Restricts transient overlays to an unlocked account's current UI session.
class AccountOverlayScope extends InheritedWidget {
  const AccountOverlayScope({
    required this.epoch,
    required this.allowed,
    required super.child,
    super.key,
  });

  final Object epoch;
  final bool allowed;

  static AccountOverlayScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AccountOverlayScope>();

  static Object? epochOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<AccountOverlayScope>()?.epoch;

  @override
  bool updateShouldNotify(AccountOverlayScope oldWidget) =>
      epoch != oldWidget.epoch || allowed != oldWidget.allowed;
}
