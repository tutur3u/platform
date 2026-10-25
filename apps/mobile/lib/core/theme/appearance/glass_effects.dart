import 'dart:ui' show ImageFilter;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Policy for frosted-glass chrome (dock, scrolled header, sheets, dialogs).
///
/// A live [BackdropFilter] re-reads and re-blurs everything behind it on every
/// frame the content beneath changes, and each one splits the GPU render pass.
/// On Android's tile-based GPUs that cost lands on every scroll and transition
/// frame, so Android draws the same surfaces as near-opaque fills instead.
/// iOS and desktop keep the live blur.
abstract final class GlassEffects {
  /// Forces the blur on or off regardless of platform, e.g. in benchmarks.
  @visibleForTesting
  static bool? debugBlurOverride;

  /// Whether glass surfaces should draw a live backdrop blur.
  static bool blurOf(BuildContext context) {
    if (MediaQuery.highContrastOf(context)) return false;
    final override = debugBlurOverride;
    if (override != null) return override;
    return defaultTargetPlatform != TargetPlatform.android;
  }

  /// Fill opacity for a glass surface whose blurred design uses [blurred].
  ///
  /// Without the blur, content behind a translucent fill reads as noise, so
  /// the fill closes most of the remaining gap to opaque. High contrast is
  /// always fully opaque.
  static double fillAlpha(BuildContext context, double blurred) {
    if (MediaQuery.highContrastOf(context)) return 1;
    if (blurOf(context)) return blurred;
    return blurred + (1 - blurred) * 0.75;
  }
}

/// Applies a backdrop blur of [sigma] behind [child] only when
/// [GlassEffects.blurOf] allows it. Callers still clip the region.
class GlassBlur extends StatelessWidget {
  const GlassBlur({required this.sigma, required this.child, super.key});

  final double sigma;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!GlassEffects.blurOf(context)) return child;
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
      child: child,
    );
  }
}
