import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';

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

/// The composer rests where the dock does: [ShellDockMetrics.bottomOffset]
/// over a bottom safe area, [assistantComposerBottomGap] above the keyboard.
double assistantComposerBottomOffset(BuildContext context) {
  final safeBottom = assistantBottomSafeArea(context);
  return safeBottom > 0
      ? ShellDockMetrics.bottomOffset(safeBottom)
      : assistantComposerBottomGap;
}

/// The in-page composer's distance from the bottom of its viewport.
///
/// With the floating dock (phones and windows below the rail breakpoint) or
/// the icon rail (tablets), the composer sits on the dock's clearance or on
/// the keyboard. Beside the sidebar (desktop windows) there is no dock, so the
/// composer keeps [AppSpacing.xl] above the bottom safe area or the keyboard.
double assistantPageComposerBottomOffset(BuildContext context) {
  final media = MediaQuery.of(context);
  if (shellNavigationModeFor(media.size) == ShellNavigationMode.dock) {
    return media.viewInsets.bottom > 0
        ? 0
        : AppPageInsets.contentBottomClearance(context);
  }
  // The shell's resized body consumes the inset, so the window's own is read.
  final view = View.maybeOf(context);
  final keyboardVisible =
      media.viewInsets.bottom > 0 ||
      (view != null && view.viewInsets.bottom > 0);
  if (keyboardVisible) {
    return shellNavigationExtendedFor(media.size) ? AppSpacing.xl : 0;
  }
  return media.viewPadding.bottom + AppSpacing.xl;
}

/// Keep the last message and jump action above the full measured panel.
double assistantPageTranscriptBottomClearance(
  BuildContext context, {
  double? composerHeight,
}) {
  final withDock =
      shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
      ShellNavigationMode.dock;
  return (composerHeight ??
          assistantComposerHeight(context) +
              (withDock ? 0 : AppSpacing.xs * 2)) +
      assistantPageComposerBottomOffset(context) +
      AppSpacing.md;
}

/// Shell Scaffold consumes the IME inset before this viewport. Its inherited
/// padding already includes navigation clearance when the composer is hidden.
double assistantTranscriptBottomClearance(
  BuildContext context, {
  required bool composerVisible,
  double? composerHeight,
}) => composerVisible
    ? (composerHeight ?? assistantComposerHeight(context) + 2) +
          assistantComposerBottomOffset(context) +
          16
    : MediaQuery.paddingOf(context).bottom + 16;
