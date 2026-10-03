import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Shared by the composer and shell so large text never overlaps navigation.
double assistantComposerHeight(BuildContext context) =>
    math.max(44, MediaQuery.textScalerOf(context).scale(16) * 1.25 + 24) + 10;

const assistantComposerBottomGap = 8.0;

const assistantExpandedNavigationClearance = 84.0;
