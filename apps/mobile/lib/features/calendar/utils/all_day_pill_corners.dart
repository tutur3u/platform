import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// Whether the pill's start and end should draw rounded corners.
({bool roundStart, bool roundEnd}) allDayPillRoundedEnds({
  required bool continuesBeforeViewport,
  required bool continuesAfterViewport,
  required bool singleVisibleDay,
}) {
  if (singleVisibleDay && !continuesBeforeViewport && !continuesAfterViewport) {
    return (roundStart: true, roundEnd: true);
  }
  return (
    roundStart: !continuesBeforeViewport,
    roundEnd: !continuesAfterViewport,
  );
}

BorderRadius allDayPillBorderRadius({
  required bool roundStart,
  required bool roundEnd,
  double? radius,
}) {
  final r = Radius.circular(radius ?? AppRadius.pill);
  return BorderRadius.horizontal(
    left: roundStart ? r : Radius.zero,
    right: roundEnd ? r : Radius.zero,
  );
}
