import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';

/// Resolves the padding of a page's content box.
///
/// Gutters and max widths derive from the width the page actually receives
/// (not the window), so a page beside the shell rail uses the gutters of its
/// own available width. Centring is expressed as extra horizontal padding,
/// which keeps the scrollable (and its scrollbar and drag area) full width.
abstract final class AppPageInsets {
  /// Pure resolver used by every page primitive and by tests.
  ///
  /// [bottom] is the already-computed bottom inset (usually dock clearance plus
  /// an end gap). [safeArea] supplies horizontal system insets such as a
  /// landscape notch; the gutter is applied inside them.
  static EdgeInsets resolve({
    required double width,
    AppPageKind kind = AppPageKind.detail,
    bool fullBleed = false,
    double top = AppLayout.pageTop,
    double bottom = 0,
    EdgeInsets safeArea = EdgeInsets.zero,
  }) {
    if (fullBleed) {
      return EdgeInsets.fromLTRB(safeArea.left, top, safeArea.right, bottom);
    }
    final deviceClass = Breakpoints.fromWidth(width);
    final gutter = AppLayout.gutter(deviceClass);
    final maxWidth = AppLayout.maxContentWidth(kind, deviceClass);
    final centring = maxWidth == null || !width.isFinite
        ? 0.0
        : math.max(0, (width - maxWidth) / 2).toDouble();
    return EdgeInsets.fromLTRB(
      gutter + math.max(centring, safeArea.left),
      top,
      gutter + math.max(centring, safeArea.right),
      bottom,
    );
  }

  /// Resolves insets for [width] using the ambient [MediaQuery].
  ///
  /// The bottom inset includes the shell's dock clearance (published as
  /// `MediaQuery.padding.bottom`) when [consumeBottomClearance] is true, plus
  /// [endGap]. Pass `consumeBottomClearance: false` when a nested scrollable
  /// reads the clearance itself.
  static EdgeInsets of(
    BuildContext context, {
    required double width,
    AppPageKind kind = AppPageKind.detail,
    bool fullBleed = false,
    double topInset = 0,
    bool consumeBottomClearance = true,
    double endGap = AppLayout.scrollEndGap,
  }) {
    final padding = MediaQuery.paddingOf(context);
    final resolvedWidth = width.isFinite
        ? width
        : MediaQuery.sizeOf(context).width;
    return resolve(
      width: resolvedWidth,
      kind: kind,
      fullBleed: fullBleed,
      top: (fullBleed ? 0 : AppLayout.pageTop) + topInset,
      bottom: consumeBottomClearance
          ? padding.bottom + (fullBleed ? 0 : endGap)
          : 0,
      safeArea: padding,
    );
  }
}
