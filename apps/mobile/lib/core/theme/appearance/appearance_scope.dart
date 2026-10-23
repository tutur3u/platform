import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/appearance/accessible_destructive_button.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Exposes the active appearance and shared blob clock to the app.
class AppearanceScope extends InheritedWidget {
  const AppearanceScope({
    required this.settings,
    required this.brightness,
    required super.child,
    this.motion,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final ValueListenable<double>? motion;

  static AppearanceScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppearanceScope>();

  /// Whether pages should let the app-wide gradient or blob layer show.
  static bool hasAmbientBackground(BuildContext context) =>
      maybeOf(context)?.settings.hasAmbientBackground ?? false;

  /// Card fill for grouped surfaces: translucent over an ambient background.
  static Color surfaceColor(BuildContext context, Color card) {
    final settings = maybeOf(context)?.settings;
    if (settings == null || !settings.hasAmbientBackground) return card;
    return card.withValues(alpha: settings.surfaceOpacity);
  }

  /// Restores opaque shad scaffolds for modal content such as sheets.
  static Widget opaqueScaffolds(Widget child) =>
      shad.ComponentTheme<shad.ScaffoldTheme>(
        data: const shad.ScaffoldTheme(),
        child: child,
      );

  @override
  bool updateShouldNotify(AppearanceScope oldWidget) =>
      settings != oldWidget.settings ||
      brightness != oldWidget.brightness ||
      motion != oldWidget.motion;
}

/// App-level appearance host placed around the router's navigator.
///
/// It paints one ambient layer behind every route and makes shad scaffolds
/// transparent while a gradient or blob style is active. The child subtree
/// keeps a stable position, so switching styles never remounts navigation.
class AppearanceBackdrop extends StatefulWidget {
  const AppearanceBackdrop({
    required this.settings,
    required this.child,
    super.key,
  });

  final AppearanceSettings settings;
  final Widget child;

  @override
  State<AppearanceBackdrop> createState() => _AppearanceBackdropState();
}

class _AppearanceBackdropState extends State<AppearanceBackdrop>
    with WidgetsBindingObserver {
  final _clock = AmbientMotionClock();
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _foreground) return;
    // Frames are disabled while backgrounded, so stop the timer here rather
    // than waiting for a rebuild.
    if (!foreground) _clock.stop();
    setState(() => _foreground = foreground);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = widget.settings;
    final brightness = shad.Theme.of(context).brightness;
    final animate =
        settings.animate &&
        settings.backgroundStyle == AppearanceBackgroundStyle.blobs &&
        _foreground &&
        TickerMode.valuesOf(context).enabled &&
        !MediaQuery.disableAnimationsOf(context);
    animate ? _clock.start() : _clock.stop();
    final ambient = settings.hasAmbientBackground;
    final motion = animate ? _clock : null;
    return AppearanceScope(
      settings: settings,
      brightness: brightness,
      motion: motion,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (ambient)
            AmbientBackground(
              settings: settings,
              brightness: brightness,
              motion: motion,
            ),
          shad.ComponentTheme<shad.ScaffoldTheme>(
            key: const ValueKey('appearance-routes'),
            data: ambient
                ? const shad.ScaffoldTheme(backgroundColor: Color(0x00000000))
                : const shad.ScaffoldTheme(),
            child: shad.ComponentTheme<shad.DestructiveButtonTheme>(
              data: accessibleDestructiveButtonTheme,
              child: widget.child,
            ),
          ),
        ],
      ),
    );
  }
}

/// Paints the ambient layer under an imperatively pushed page route, so its
/// transition never reveals the page beneath through transparent scaffolds.
class AppearanceRouteBackground extends StatelessWidget {
  const AppearanceRouteBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scope = AppearanceScope.maybeOf(context);
    final ambient = scope != null && scope.settings.hasAmbientBackground;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (ambient)
          AmbientBackground(
            settings: scope.settings,
            brightness: scope.brightness,
            motion: scope.motion,
          ),
        KeyedSubtree(key: const ValueKey('appearance-route'), child: child),
      ],
    );
  }
}
