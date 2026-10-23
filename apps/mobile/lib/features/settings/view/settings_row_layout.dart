import 'package:flutter/widgets.dart';

abstract final class SettingsRowLayout {
  static const double inset = 12;
  static const double iconWidth = 24;
  static const double textGap = 12;
  static const double actionWidth = 44;
  static const double minHeight = 56;

  static EdgeInsets scrollPadding(BuildContext context, double horizontal) =>
      EdgeInsets.fromLTRB(
        horizontal,
        10,
        horizontal,
        32 + MediaQuery.paddingOf(context).bottom,
      );
}
