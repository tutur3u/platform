import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Theme;
import 'package:flutter/rendering.dart';
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
    final theme = shad.Theme.of(context);
    final brightness = theme.brightness;
    final animate =
        settings.animate &&
        settings.backgroundStyle == AppearanceBackgroundStyle.blobs &&
        _foreground &&
        TickerMode.valuesOf(context).enabled &&
        !settings.reduceMotion &&
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
              child: shad.ComponentTheme<shad.TabsTheme>(
                data: concentricTabsTheme(theme),
                child: widget.child,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Paints the page backdrop under a pushed page route, so its transition
/// never reveals the page beneath through a page without its own opaque
/// surface.
///
/// Solid appearances paint the theme's page color. Ambient appearances
/// paint their layer only while the route moves: at rest the app-wide layer
/// already shows behind the page, and while moving the layer is laid out at
/// screen size and painted fixed to the screen, so it meets the app-wide
/// layer under the header, beside a rail and at the sliding edge without a
/// seam.
class AppearanceRouteBackground extends StatelessWidget {
  const AppearanceRouteBackground({
    required this.animation,
    required this.secondaryAnimation,
    required this.child,
    super.key,
  });

  /// The route's own animations; the route moves while either runs.
  final Animation<double> animation;
  final Animation<double> secondaryAnimation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scope = AppearanceScope.maybeOf(context);
    final ambient = scope != null && scope.settings.hasAmbientBackground;
    final moving = animation.isAnimating || secondaryAnimation.isAnimating;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (!ambient)
          ColoredBox(
            key: const ValueKey('appearance-route-backdrop'),
            color: Theme.of(context).scaffoldBackgroundColor,
          )
        else if (moving)
          _ScreenAligned(
            key: const ValueKey('appearance-route-ambient'),
            screen: MediaQuery.sizeOf(context),
            animation: animation,
            secondaryAnimation: secondaryAnimation,
            child: AmbientBackground(
              settings: scope.settings,
              brightness: scope.brightness,
              motion: scope.motion,
            ),
          ),
        KeyedSubtree(key: const ValueKey('appearance-route'), child: child),
      ],
    );
  }
}

/// `shad.Tabs` geometry whose selected tab is concentric with its track.
///
/// The package draws the track with `radiusLg` and the selected tab with
/// `radiusMd` inside half a density gap of padding, which only line up at
/// the default radius scale. The tab corners are fixed by the package, so
/// the track takes them plus the same equal padding on every side.
shad.TabsTheme concentricTabsTheme(shad.ThemeData theme) {
  final padding = concentricTabsPadding(theme);
  return shad.TabsTheme(
    containerPadding: EdgeInsets.all(padding),
    borderRadius: BorderRadius.circular(theme.radiusMd + padding),
  );
}

/// Gap between the `shad.Tabs` track and its selected tab on every side.
double concentricTabsPadding(shad.ThemeData theme) =>
    theme.density.baseGap * theme.scaling * 0.5;

/// Lays its child out at [screen] size and paints it at the screen origin,
/// clipped to this box, repainting as the route's animations move the box.
class _ScreenAligned extends SingleChildRenderObjectWidget {
  const _ScreenAligned({
    required this.screen,
    required this.animation,
    required this.secondaryAnimation,
    super.child,
    super.key,
  });

  final Size screen;
  final Animation<double> animation;
  final Animation<double> secondaryAnimation;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderScreenAligned(screen, [animation, secondaryAnimation]);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderScreenAligned renderObject,
  ) => renderObject
    ..screen = screen
    ..repaint = [animation, secondaryAnimation];
}

class _RenderScreenAligned extends RenderProxyBox {
  _RenderScreenAligned(this._screen, this._repaint);

  Size _screen;
  Size get screen => _screen;
  set screen(Size value) {
    if (value == _screen) return;
    _screen = value;
    markNeedsLayout();
  }

  /// The listenables whose ticks move this box; kept as given, so a rebuild
  /// with the same route animations changes no subscription.
  List<Listenable> _repaint;
  List<Listenable> get repaint => _repaint;
  set repaint(List<Listenable> value) {
    if (listEquals(value, _repaint)) return;
    if (attached) _listen(listen: false);
    _repaint = value;
    if (attached) _listen(listen: true);
    markNeedsPaint();
  }

  void _listen({required bool listen}) {
    for (final listenable in _repaint) {
      listen
          ? listenable.addListener(markNeedsPaint)
          : listenable.removeListener(markNeedsPaint);
    }
  }

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _listen(listen: true);
  }

  @override
  void detach() {
    _listen(listen: false);
    super.detach();
  }

  @override
  void performLayout() {
    size = constraints.biggest;
    child?.layout(BoxConstraints.tight(_screen));
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final child = this.child;
    if (child == null) return;
    final origin = localToGlobal(Offset.zero);
    layer = context.pushClipRect(
      needsCompositing,
      offset,
      Offset.zero & size,
      (context, offset) => context.paintChild(child, offset - origin),
      oldLayer: layer as ClipRectLayer?,
    );
  }

  @override
  void applyPaintTransform(RenderBox child, Matrix4 transform) {
    final origin = localToGlobal(Offset.zero);
    transform.translateByDouble(-origin.dx, -origin.dy, 0, 1);
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      false;
}
