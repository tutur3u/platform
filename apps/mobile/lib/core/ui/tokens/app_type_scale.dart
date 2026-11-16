import 'package:flutter/widgets.dart';

/// Metrics of one type role. [lineHeight] is in logical pixels and
/// [tracking] in em, as in `sorbet-tokens.json`; null [lineHeight] keeps the
/// font's natural line height.
@immutable
class AppTypeRole {
  const AppTypeRole(
    this.size, {
    this.weight = FontWeight.w400,
    this.lineHeight,
    this.tracking = 0,
    this.mono = false,
    this.tabular = false,
  });

  final double size;
  final FontWeight weight;
  final double? lineHeight;
  final double tracking;

  /// Set in the mono family when the design has one.
  final bool mono;

  /// Tabular figures, for times, counts and amounts.
  final bool tabular;
}

/// Semantic type roles. Components read these instead of picking sizes, so
/// each design sets its metrics in one place.
///
/// [classic] reproduces the metrics the components use in the classic
/// design. [sorbet] carries the contract `type.styles`, with `mobileSize`
/// where the contract defines one.
@immutable
class AppTypeScale {
  const AppTypeScale({
    required this.display,
    required this.title,
    required this.heading,
    required this.bodyLg,
    required this.body,
    required this.bodySm,
    required this.ui,
    required this.uiSm,
    required this.uiCompact,
    required this.caption,
    required this.overline,
    required this.numeric,
  });

  static const classic = AppTypeScale(
    display: AppTypeRole(30, weight: FontWeight.w600),
    title: AppTypeRole(18, weight: FontWeight.w600),
    heading: AppTypeRole(16, weight: FontWeight.w600),
    bodyLg: AppTypeRole(18),
    body: AppTypeRole(16),
    bodySm: AppTypeRole(14),
    ui: AppTypeRole(14, weight: FontWeight.w500),
    uiSm: AppTypeRole(12, weight: FontWeight.w500),
    uiCompact: AppTypeRole(14),
    caption: AppTypeRole(12, weight: FontWeight.w600),
    overline: AppTypeRole(12, weight: FontWeight.w600, tracking: 0.05),
    numeric: AppTypeRole(12, tabular: true),
  );

  static const sorbet = AppTypeScale(
    display: AppTypeRole(
      32,
      weight: FontWeight.w800,
      lineHeight: 32 * 1.05,
      tracking: -0.025,
    ),
    title: AppTypeRole(
      22,
      weight: FontWeight.w700,
      lineHeight: 28,
      tracking: -0.01,
    ),
    heading: AppTypeRole(18, weight: FontWeight.w700, lineHeight: 24),
    bodyLg: AppTypeRole(17, lineHeight: 17 * 1.6),
    body: AppTypeRole(16, lineHeight: 16 * 1.55),
    bodySm: AppTypeRole(13.5, lineHeight: 20),
    ui: AppTypeRole(15, weight: FontWeight.w600, lineHeight: 20),
    uiSm: AppTypeRole(13, weight: FontWeight.w600, lineHeight: 18),
    uiCompact: AppTypeRole(14, weight: FontWeight.w600, lineHeight: 20),
    caption: AppTypeRole(12.5, weight: FontWeight.w600, lineHeight: 16),
    overline: AppTypeRole(11, lineHeight: 16, tracking: 0.12, mono: true),
    numeric: AppTypeRole(11.5, lineHeight: 16, mono: true, tabular: true),
  );

  /// Auth and onboarding titles (`display-lg`).
  final AppTypeRole display;

  /// Top bar, sheet and detail titles.
  final AppTypeRole title;

  /// Section, sheet and modal headers.
  final AppTypeRole heading;
  final AppTypeRole bodyLg;

  /// Paragraphs, row labels and inputs.
  final AppTypeRole body;

  /// Secondary row lines, field labels and helper text.
  final AppTypeRole bodySm;

  /// Buttons and row values.
  final AppTypeRole ui;

  /// Small buttons.
  final AppTypeRole uiSm;

  /// Chips and segmented controls.
  final AppTypeRole uiCompact;

  /// Badges and captions under amounts (contract `small`).
  final AppTypeRole caption;

  /// Section overlines and dates (contract `label`). Callers pass the text
  /// in upper case; a style cannot transform case.
  final AppTypeRole overline;

  /// Times, counts and amounts in rows.
  final AppTypeRole numeric;
}
