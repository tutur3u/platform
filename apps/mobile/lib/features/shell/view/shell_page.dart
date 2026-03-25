import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_top_bar_title.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'shell_page_interactions.dart';
part 'shell_page_layout.dart';
part 'shell_page_navigation.dart';

/// Shell layout with adaptive navigation.
///
/// Wraps all tab-level routes via GoRouter's [ShellRoute].
/// - **compact** → bottom [shad.NavigationBar]
/// - **medium**  → side [shad.NavigationRail]
/// - **expanded** → side [shad.NavigationSidebar]
class ShellPage extends StatefulWidget {
  const ShellPage({
    required this.child,
    required this.matchedLocation,
    super.key,
  });

  final Widget child;
  final String matchedLocation;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  static const ValueKey<String> _homeKey = ValueKey('home');
  static const ValueKey<String> _appsKey = ValueKey('apps');
  static const ValueKey<String> _assistantKey = ValueKey('assistant');
  static const ValueKey<String> _globalLayerKey = ValueKey('global-layer');
  static const ValueKey<String> _miniLayerKey = ValueKey('mini-layer');
  static const ValueKey<String> _backToRootKey = ValueKey('back-to-root');
  static const double _navIconSize = 22;
  static const double _navItemSpacing = 2;
  static const double _floatingNavMinItemWidth = 96;

  final Stopwatch _tapStopwatch = Stopwatch();
  int? _lastTabIndex;
  Timer? _longPressTimer;
  final GlobalKey _appsTabKey = GlobalKey();
  DateTime? _lastAppsTabPointerUpAt;
  late final PageController _layerController;
  Widget? _cachedGlobalBody;
  int _activeLayerPage = 1;
  bool _syncingLayerPage = false;
  bool _showMiniNav = true;
  String? _lastLayeredLocation;
  final List<String> _routeHistory = [];
  bool _isHandlingBackNavigation = false;
  bool _isProcessingBackNavigation = false;
  bool _ignoreNextPopScopeCallback = false;
  Timer? _suppressPointerTimer;
  bool _suppressPointerInput = false;

  void _debugBack(String event, [String? details]) {
    debugPrint(
      '[ShellBack] $event '
      'route=${_normalizeRouteLocation(widget.matchedLocation)} '
      'history=${_routeHistory.join(' > ')} '
      'flags={handling:$_isHandlingBackNavigation,'
      'processing:$_isProcessingBackNavigation,'
      'ignoreNextPop:$_ignoreNextPopScopeCallback}'
      '${details == null ? '' : ' $details'}',
    );
  }

  bool _isAppsTabHit(Offset position) {
    final ctx = _appsTabKey.currentContext;
    if (ctx == null) return false;
    final renderBox = ctx.findRenderObject() as RenderBox?;
    if (renderBox == null || !renderBox.hasSize) return false;
    final overlay = Overlay.of(ctx).context.findRenderObject() as RenderBox?;
    if (overlay == null) return false;
    final topLeft = renderBox.localToGlobal(Offset.zero, ancestor: overlay);
    final bounds = topLeft & renderBox.size;
    return bounds.contains(position);
  }

  @override
  void initState() {
    super.initState();
    _layerController = PageController(initialPage: 1);
  }

  @override
  void didUpdateWidget(covariant ShellPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    _recordRouteVisit(
      oldLocation: oldWidget.matchedLocation,
      newLocation: widget.matchedLocation,
    );
    _syncCompactLayoutState(oldMatchedLocation: oldWidget.matchedLocation);
  }

  @override
  Widget build(BuildContext context) {
    final location = widget.matchedLocation;
    final activeModule = AppRegistry.moduleFromLocation(location);

    return BackButtonListener(
      onBackButtonPressed: () async {
        _debugBack('BackButtonListener.start');
        _ignoreNextPopScopeCallback = true;
        await _runBackNavigation(context);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _debugBack('BackButtonListener.postFrameReset');
          _ignoreNextPopScopeCallback = false;
        });
        return true;
      },
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) {
          _debugBack('PopScope.invoked', 'didPop=$didPop result=$result');
          if (didPop) {
            return;
          }
          if (_ignoreNextPopScopeCallback) {
            _debugBack('PopScope.ignored');
            _ignoreNextPopScopeCallback = false;
            return;
          }
          unawaited(_runBackNavigation(context));
        },
        child: IgnorePointer(
          ignoring: _suppressPointerInput,
          child: BlocBuilder<AppTabCubit, AppTabState>(
            builder: (context, state) => _buildCompactLayout(
              context,
              state,
              activeModule: activeModule,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _runBackNavigation(BuildContext context) async {
    if (_isProcessingBackNavigation) {
      _debugBack('runBackNavigation.skipAlreadyProcessing');
      return;
    }
    _debugBack('runBackNavigation.start');
    _isProcessingBackNavigation = true;
    try {
      await _handleBackNavigation(context);
    } finally {
      _isProcessingBackNavigation = false;
      _debugBack('runBackNavigation.end');
    }
  }

  Future<void> _handleBackNavigation(BuildContext context) async {
    final currentLocation = _normalizeRouteLocation(widget.matchedLocation);
    final miniAppRoot = Routes.miniAppRootForLocation(currentLocation);
    _debugBack(
      'handleBackNavigation.evaluate',
      'current=$currentLocation miniAppRoot=$miniAppRoot',
    );
    if (miniAppRoot != null && miniAppRoot != currentLocation) {
      final previousMiniAppLocation = _peekPreviousRoute(currentLocation);
      if (previousMiniAppLocation != null &&
          _isSameMiniAppFamily(currentLocation, previousMiniAppLocation)) {
        final previousLocation = _takePreviousRoute(currentLocation);
        if (previousLocation != null) {
          _debugBack(
            'handleBackNavigation.toPreviousMiniApp',
            previousLocation,
          );
          debugPrintStack(
            label:
                '[ShellNav] go $previousLocation from back previous mini-app',
          );
          _isHandlingBackNavigation = true;
          context.go(previousLocation);
          return;
        }
      }

      _debugBack('handleBackNavigation.toMiniAppRoot', miniAppRoot);
      debugPrintStack(
        label: '[ShellNav] go $miniAppRoot from back mini-app root fallback',
      );
      _isHandlingBackNavigation = true;
      context.go(miniAppRoot);
      return;
    }

    if (Routes.isMiniAppRootLocation(currentLocation)) {
      _suppressPointerEventsDuringTransition();
      _debugBack('handleBackNavigation.toApps');
      debugPrintStack(label: '[ShellNav] go ${Routes.apps} from back mini-app');
      _isHandlingBackNavigation = true;
      context.go(Routes.apps);
      return;
    }

    final previousLocation = _takePreviousRoute(currentLocation);
    if (previousLocation != null) {
      _debugBack('handleBackNavigation.toPreviousRoute', previousLocation);
      debugPrintStack(
        label: '[ShellNav] go $previousLocation from back previous route',
      );
      _isHandlingBackNavigation = true;
      context.go(previousLocation);
      return;
    }

    if (!_isExitLocation(currentLocation)) {
      _debugBack('handleBackNavigation.toHome');
      debugPrintStack(label: '[ShellNav] go ${Routes.home} from back fallback');
      _isHandlingBackNavigation = true;
      context.go(Routes.home);
      return;
    }

    _debugBack('handleBackNavigation.systemPop');
    await SystemNavigator.pop();
  }

  void _recordRouteVisit({
    required String oldLocation,
    required String newLocation,
  }) {
    final previous = _normalizeRouteLocation(oldLocation);
    final current = _normalizeRouteLocation(newLocation);

    if (previous == current) {
      _debugBack(
        'recordRouteVisit.skipSameRoute',
        'old=$previous new=$current',
      );
      return;
    }

    if (_isHandlingBackNavigation) {
      _debugBack(
        'recordRouteVisit.skipBackHandled',
        'old=$previous new=$current',
      );
      _isHandlingBackNavigation = false;
      return;
    }

    _routeHistory.add(previous);
    if (_routeHistory.length > 50) {
      _routeHistory.removeAt(0);
    }
    _debugBack('recordRouteVisit.added', 'old=$previous new=$current');
  }

  String? _takePreviousRoute(String currentLocation) {
    while (_routeHistory.isNotEmpty) {
      final previous = _routeHistory.removeLast();
      if (_normalizeRouteLocation(previous) == currentLocation) {
        continue;
      }
      return previous;
    }
    return null;
  }

  String? _peekPreviousRoute(String currentLocation) {
    for (var i = _routeHistory.length - 1; i >= 0; i--) {
      final candidate = _normalizeRouteLocation(_routeHistory[i]);
      if (candidate == currentLocation) {
        continue;
      }
      return candidate;
    }
    return null;
  }

  bool _isSameMiniAppFamily(String locationA, String locationB) {
    final rootA = Routes.miniAppRootForLocation(locationA);
    final rootB = Routes.miniAppRootForLocation(locationB);
    return rootA != null && rootA == rootB;
  }

  bool _isExitLocation(String location) {
    return location == Routes.home || location == Routes.apps;
  }

  String _normalizeRouteLocation(String value) {
    return Routes.normalizeLocation(value);
  }

  void _setShellState(VoidCallback fn) {
    if (!mounted) return;
    setState(fn);
  }

  void _suppressPointerEventsDuringTransition() {
    _debugBack('pointerSuppression.start');
    _suppressPointerTimer?.cancel();
    _setShellState(() => _suppressPointerInput = true);
    _suppressPointerTimer = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      _debugBack('pointerSuppression.end');
      _setShellState(() => _suppressPointerInput = false);
    });
  }

  @override
  void dispose() {
    _stopLongPressTimer();
    _suppressPointerTimer?.cancel();
    _layerController.dispose();
    super.dispose();
  }

  static int _indexForKey(Key? key) {
    if (key == _assistantKey) return 1;
    if (key == _appsKey || key is GlobalKey) return 2;
    return 0;
  }

  static int _calculateSelectedIndex(String location) {
    if (location.startsWith(Routes.assistant)) return 1;
    if (location.startsWith(Routes.apps)) return 2;
    if (AppRegistry.moduleFromLocation(location) != null) return 2;
    return 0; // home
  }
}
