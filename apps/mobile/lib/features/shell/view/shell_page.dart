import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
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
  static const double _compactMiniBackButtonMinWidth = 68;

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
    _syncCompactLayoutState(oldMatchedLocation: oldWidget.matchedLocation);
  }

  @override
  Widget build(BuildContext context) {
    final location = widget.matchedLocation;
    final activeModule = AppRegistry.moduleFromLocation(location);

    return BlocBuilder<AppTabCubit, AppTabState>(
      builder: (context, state) => _buildCompactLayout(
        context,
        state,
        activeModule: activeModule,
      ),
    );
  }

  void _setShellState(VoidCallback fn) {
    if (!mounted) return;
    setState(fn);
  }

  @override
  void dispose() {
    _stopLongPressTimer();
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
