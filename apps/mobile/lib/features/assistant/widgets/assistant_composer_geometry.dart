import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';

/// Shared by the composer and shell so large text never overlaps navigation.
double assistantComposerHeight(BuildContext context) =>
    math.max(52, MediaQuery.textScalerOf(context).scale(16) * 1.25 + 24);

const double assistantComposerBottomGap = floatingDockBottomGap;

const assistantExpandedNavigationClearance = 84.0;

/// IME-resized viewports must not reserve the physical bottom inset again.
double assistantBottomSafeArea(BuildContext context) =>
    MediaQuery.viewInsetsOf(context).bottom > 0
    ? 0
    : MediaQuery.paddingOf(context).bottom;

double assistantComposerBottomOffset(BuildContext context) =>
    assistantBottomSafeArea(context) + assistantComposerBottomGap;
