import 'package:mobile/core/responsive/breakpoints.dart';

/// The 4pt spacing scale shared by every mobile screen.
///
/// Prefer these names over literal `EdgeInsets` values so gutters, gaps and
/// row insets stay consistent across features.
abstract final class AppSpacing {
  static const double none = 0;
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
  static const double huge = 40;
}

/// Corner radii for surfaces. Grouped cards are heavily rounded on purpose.
abstract final class AppRadius {
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double card = 22;
  static const double sheet = 24;
  static const double dock = 26;
  static const double pill = 999;
}

/// Width policy for a page. Each kind maps to a max content width per
/// [DeviceClass]; compact screens never constrain width.
enum AppPageKind {
  /// Root destinations and dashboards: wide multi-column canvases.
  root,

  /// Lists and detail screens inside a mini app.
  detail,

  /// Data-entry screens such as auth, create and edit forms.
  form,

  /// Long-form text such as documents, notes and descriptions.
  reading,
}

/// Page-level layout tokens. `ResponsivePadding` derives from these values.
abstract final class AppLayout {
  /// Expanded windows use 12.5% more space for adaptive insets and rows.
  /// Compact and medium windows retain the base spacing scale.
  static double spacingScale(DeviceClass deviceClass) =>
      deviceClass == DeviceClass.expanded ? 1.125 : 1;

  /// Horizontal page gutter per device class.
  static double gutter(DeviceClass deviceClass) {
    final base = switch (deviceClass) {
      DeviceClass.compact => AppSpacing.lg,
      DeviceClass.medium => AppSpacing.xxl,
      DeviceClass.expanded => AppSpacing.xxxl,
    };
    return base * spacingScale(deviceClass);
  }

  /// Maximum width of the content box (gutters included) for [kind].
  ///
  /// Returns `null` when the page should use the full available width.
  static double? maxContentWidth(AppPageKind kind, DeviceClass deviceClass) =>
      switch ((kind, deviceClass)) {
        (_, DeviceClass.compact) => null,
        (AppPageKind.root, DeviceClass.medium) => 1120,
        (AppPageKind.root, DeviceClass.expanded) => 1680,
        (AppPageKind.detail, DeviceClass.medium) => 600,
        (AppPageKind.detail, DeviceClass.expanded) => 1120,
        (AppPageKind.form, DeviceClass.medium) => 480,
        (AppPageKind.form, DeviceClass.expanded) => 552,
        (AppPageKind.reading, DeviceClass.medium) => 640,
        // 720dp of reading space inside two 36dp gutters.
        (AppPageKind.reading, DeviceClass.expanded) => 792,
      };

  /// Gap between the shell header (or page top) and the first content.
  static const double pageTop = AppSpacing.sm;

  /// Extra space after the last scroll item, on top of dock clearance.
  static const double scrollEndGap = AppSpacing.xxl;

  /// Extra space below a non-scrolling page body, on top of dock clearance.
  static const double boxEndGap = AppSpacing.lg;

  /// Vertical gap between grouped sections.
  static const double sectionGap = AppSpacing.xxl;

  /// Gap between a section caption and its card.
  static const double sectionCaptionGap = AppSpacing.sm;

  /// Horizontal inset of a section caption relative to its card edge.
  static const double sectionCaptionInset = AppSpacing.lg;

  /// Vertical gap between stacked cards or list items.
  static const double itemGap = AppSpacing.md;

  /// Minimum height of a two-line row (title plus subtitle).
  static const double rowMinHeight = 56;

  /// Minimum height of a single-line row; still a 48dp touch target.
  static const double rowCompactMinHeight = 48;

  /// Horizontal padding inside a grouped row.
  static const double rowHorizontalPadding = AppSpacing.lg;

  /// Size of a row's leading icon tile.
  static const double rowLeadingSize = 32;

  /// Gap between a row's leading icon tile and its text.
  static const double rowLeadingGap = AppSpacing.md;

  /// Leading inset for dividers between rows that have a leading icon tile,
  /// so the divider aligns with the row text rather than the card edge.
  static const double rowDividerInset =
      rowHorizontalPadding + rowLeadingSize + rowLeadingGap;

  /// Width at which the shell swaps the bottom dock for a leading rail: web's
  /// `md` breakpoint, so portrait tablets (about 768-834dp) get the rail too.
  static const double navigationRailMinWidth = 768;
}
