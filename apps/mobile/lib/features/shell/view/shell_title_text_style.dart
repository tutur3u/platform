import 'package:flutter/material.dart';

/// Match Text's inheritance and platform accessibility overrides for geometry.
TextStyle effectiveShellTitleStyle(BuildContext context, {TextStyle? style}) {
  var effective = style == null || style.inherit
      ? DefaultTextStyle.of(context).style.merge(style)
      : style;
  if (MediaQuery.boldTextOf(context)) {
    effective = effective.merge(const TextStyle(fontWeight: FontWeight.bold));
  }
  return effective.merge(
    TextStyle(
      height: MediaQuery.maybeLineHeightScaleFactorOverrideOf(context),
      letterSpacing: MediaQuery.maybeLetterSpacingOverrideOf(context),
      wordSpacing: MediaQuery.maybeWordSpacingOverrideOf(context),
    ),
  );
}
