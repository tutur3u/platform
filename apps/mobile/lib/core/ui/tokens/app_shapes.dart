import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Corner radii, sheet handle and field metrics of the controls, resolved
/// once per design so components never branch on it.
///
/// [AppShapes.classic] reproduces the classic component values (following
/// the Appearance corner style where they always did); [AppShapes.sorbet]
/// maps the Sorbet radius option: pill controls, 18 cards, 24 panels and
/// sheets under soft corners.
@immutable
class AppShapes {
  const AppShapes({
    required this.button,
    required this.field,
    required this.textArea,
    required this.chip,
    required this.badge,
    required this.segment,
    required this.card,
    required this.panel,
    required this.sheet,
    required this.dialog,
    required this.handleSize,
    required this.handleColor,
    required this.fieldMinHeight,
    required this.fieldPadding,
    this.focusRadius,
  });

  factory AppShapes.classic(
    AppInterfaceTokens corners,
    AppColorTokens colors,
  ) => AppShapes(
    button: corners.radius(10),
    field: corners.radius(AppRadius.sm),
    textArea: corners.radius(AppRadius.sm),
    chip: 10,
    badge: AppRadius.pill,
    segment: AppRadius.pill,
    card: corners.radius(AppRadius.md),
    panel: corners.radius(AppRadius.card),
    sheet: corners.radius(AppRadius.sheet),
    dialog: AppRadius.sheet,
    handleSize: const Size(40, 5),
    handleColor: colors.mutedForeground.withValues(alpha: 0.35),
    fieldMinHeight: 0,
    fieldPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    focusRadius: 8,
  );

  factory AppShapes.sorbet(SorbetTokens tokens, AppColorTokens colors) {
    final radii = tokens.radii;
    return AppShapes(
      button: radii.interactive,
      field: radii.interactive,
      textArea: radii.control,
      chip: radii.interactive,
      badge: radii.interactive,
      segment: radii.interactive,
      card: radii.card,
      panel: radii.panel,
      sheet: radii.sheet,
      dialog: radii.sheet,
      handleSize: tokens.metrics.sheetHandle,
      handleColor: colors.input,
      fieldMinHeight: tokens.metrics.touchTarget,
      fieldPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
    );
  }

  /// Text buttons and icon buttons.
  final double button;

  /// Single-line inputs, search fields and select triggers.
  final double field;

  /// Multi-line inputs, which a pill would clip.
  final double textArea;
  final double chip;
  final double badge;

  /// Segmented control track; the selected segment is inset by its padding.
  final double segment;
  final double card;
  final double panel;

  /// Top corners of bottom sheets.
  final double sheet;

  /// Centred dialogs that replace a sheet on wider screens.
  final double dialog;
  final Size handleSize;
  final Color handleColor;

  /// Minimum height of a text field; 0 keeps the content height.
  final double fieldMinHeight;
  final EdgeInsets fieldPadding;

  /// Focus ring corners for chips and segments, or null to follow each
  /// control's own corners.
  final double? focusRadius;

  /// [radius] for a shape inset by [by] inside it, keeping corners
  /// concentric; pills stay pills.
  static double inset(double radius, double by) =>
      radius >= AppRadius.pill ? radius : math.max(0, radius - by);
}

/// Depth recipes per design: shadows, and whether surfaces draw a 1 px
/// outline. Sorbet separates cards by shadow only; classic keeps outlines.
@immutable
class AppDepth {
  const AppDepth({
    required this.outlined,
    required this.selection,
    required this.card,
    required this.raised,
    required this.overlay,
  });

  factory AppDepth.classic(AppColorTokens colors) => AppDepth(
    outlined: true,
    selection: const [],
    card: const [],
    raised: AppElevation.raised(colors),
    overlay: AppElevation.overlay(colors),
  );

  factory AppDepth.sorbet(SorbetTokens tokens) => AppDepth(
    outlined: false,
    selection: tokens.shadows.sm,
    card: tokens.shadows.md,
    raised: tokens.shadows.md,
    overlay: tokens.shadows.lg,
  );

  /// Cards, panels and selected segments draw an outline.
  final bool outlined;

  /// Selected segments and chips.
  final List<BoxShadow> selection;

  /// Resting cards and panels.
  final List<BoxShadow> card;

  /// Cards that float above content.
  final List<BoxShadow> raised;

  /// Sheets, dialogs and toasts.
  final List<BoxShadow> overlay;
}
