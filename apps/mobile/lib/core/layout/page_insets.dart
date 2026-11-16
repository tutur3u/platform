import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scales.dart';

/// Geometry of the shell's floating dock and tablet chrome, read from the
/// `mobile` metrics of the Sorbet token contract ([SorbetMetrics]). Classic
/// and Sorbet share them. [height] and [inset] stay compile-time constants
/// for const layouts; a parity test pins them to the contract.
abstract final class ShellDockMetrics {
  static const _contract = SorbetMetrics();

  /// Height of the dock pill (`mobile.dockHeight`).
  static const double height = 64;

  /// Gap between the pill and the left, right and bottom edges; the bottom
  /// gap sits above the system safe area (`mobile.dockInset`).
  static const double inset = 12;

  /// Inner padding of the pill around its slots.
  static const double padding = 6;

  /// Height of one destination slot and diameter of the Back circle.
  static const double slot = 52;

  /// Widest the pill grows; tablets centre it (`mobile.dockMaxWidth`).
  static double get dockMaxWidth => _contract.dockMaxWidth;

  /// Width from which the tablet chrome applies (`mobile.tabletBreakpoint`).
  /// Two-column layouts start earlier, at `mobile.breakpoint`.
  static double get tabletBreakpoint => _contract.tabletBreakpoint;

  /// Horizontal screen padding on tablets (`mobile.tabletGutter`).
  static double get tabletGutter => _contract.tabletGutter;

  /// Fade above the pill that keeps content under it legible
  /// (`mobile.dockFadeHeight`).
  static double get dockFadeHeight => _contract.dockFadeHeight;

  /// Opacity of the ink hairline on the pill's edge
  /// (`mobile.dockHairlineOpacity`).
  static double get dockHairlineOpacity => _contract.dockHairlineOpacity;

  /// Backdrop blur behind the dock; 0 paints it solid (`mobile.dockBlur`).
  static double get dockBlur => _contract.dockBlur;

  /// Space the dock occupies above the safe area: the pill plus its gap
  /// below and the same gap above it.
  static const double clearance = height + inset * 2;

  /// Pill width for a window [width]: full width minus the side insets on
  /// phones, centred and capped from the tablet breakpoint.
  static double widthFor(double width) {
    final available = math.max(0, width - inset * 2).toDouble();
    return width >= tabletBreakpoint
        ? math.min(available, dockMaxWidth)
        : available;
  }
}

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

  /// Horizontal gutter for the [width] a widget actually receives (usually a
  /// `LayoutBuilder`'s max width), so canvases beside the shell rail use the
  /// gutter of their own body. Falls back to the window when unbounded.
  static double gutterOf(BuildContext context, {required double width}) =>
      AppLayout.gutter(
        Breakpoints.fromWidth(
          width.isFinite ? width : MediaQuery.sizeOf(context).width,
        ),
      );

  /// Bottom padding every scroll view inside the shell reserves:
  /// `dockHeight + dockInset * 2 + safeArea.bottom` (122 on a phone whose
  /// bottom safe area is 34).
  ///
  /// The shell publishes this value as `MediaQuery.padding.bottom` for its
  /// body while the dock shows, so inside the shell the ambient padding is
  /// already the clearance; [safeBottom] is the system inset used when the
  /// shell computes what it publishes.
  static double contentBottomClearance(
    BuildContext context, {
    double? safeBottom,
  }) => safeBottom == null
      ? MediaQuery.paddingOf(context).bottom
      : ShellDockMetrics.clearance + safeBottom;

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
          ? contentBottomClearance(context) + (fullBleed ? 0 : endGap)
          : 0,
      safeArea: padding,
    );
  }
}
