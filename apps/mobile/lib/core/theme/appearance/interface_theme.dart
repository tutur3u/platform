import 'package:flutter/material.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';

/// Applies the Appearance interface choices through the theme: page
/// transitions and the [AppInterfaceTokens] extension on the Material theme.
abstract final class AppInterfaceTheme {
  static final _cache = <(int, AppInterfaceTokens), ThemeData>{};

  /// [base] with the interface style applied. The default style returns
  /// [base] itself, so default installs keep their exact theme objects.
  static ThemeData apply(ThemeData base, AppInterfaceTokens tokens) {
    if (tokens == AppInterfaceTokens.standard) return base;
    final key = (identityHashCode(base), tokens);
    final hit = _cache[key];
    if (hit != null) return hit;
    if (_cache.length > 16) _cache.clear();
    return _cache[key] = base.copyWith(
      pageTransitionsTheme: AppTheme.pageTransitionsFor(tokens.style),
      extensions: [
        ...base.extensions.values.where((e) => e is! AppInterfaceTokens),
        tokens,
      ],
    );
  }
}

/// Publishes the scroll feel and the per-device Reduce motion choice below
/// the theme. The subtree shape never changes with the settings, so
/// switching styles does not remount navigation.
class AppInterfaceScope extends StatelessWidget {
  const AppInterfaceScope({
    required this.settings,
    required this.child,
    super.key,
  });

  final AppearanceSettings settings;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final parent = ScrollConfiguration.of(context);
    final physics = settings.interfaceTokens.scrollPhysics;
    final media = MediaQuery.of(context);
    return ScrollConfiguration(
      behavior: physics == null ? parent : parent.copyWith(physics: physics),
      child: MediaQuery(
        // The system setting can only add reduction, never remove it.
        data: media.copyWith(
          disableAnimations: media.disableAnimations || settings.reduceMotion,
        ),
        child: child,
      ),
    );
  }
}
