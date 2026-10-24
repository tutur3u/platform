import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';

/// Device-class-aware spacing and max-width constants.
///
/// Thin compatibility layer over [AppLayout]; new code should prefer the page
/// primitives in `package:mobile/core/layout/layout.dart`.
class ResponsivePadding {
  const ResponsivePadding._();

  /// Horizontal page padding that increases with screen width.
  static double horizontal(DeviceClass deviceClass) =>
      AppLayout.gutter(deviceClass);

  /// Maximum content width for general pages ([AppPageKind.detail]).
  ///
  /// Returns `null` on compact (no constraint), so callers can skip wrapping.
  static double? maxContentWidth(DeviceClass deviceClass) =>
      AppLayout.maxContentWidth(AppPageKind.detail, deviceClass);

  /// Shared canvas width for the five root destinations. Detail and form
  /// screens keep their narrower reading widths above.
  static double? rootContentWidth(DeviceClass deviceClass) =>
      AppLayout.maxContentWidth(AppPageKind.root, deviceClass);

  /// Maximum width for form layouts (auth pages, settings).
  static double maxFormWidth(DeviceClass deviceClass) =>
      AppLayout.maxContentWidth(AppPageKind.form, deviceClass) ??
      double.infinity;
}
