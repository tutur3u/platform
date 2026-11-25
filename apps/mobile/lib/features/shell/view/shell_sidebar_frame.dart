import 'dart:async';
import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/features/shell/view/shell_sidebar_mode_menu.dart';
import 'package:mobile/features/shell/view/shell_sidebar_shortcuts.dart';

typedef SidebarRailBuilder =
    Widget Function(
      bool extended,
      Widget modeMenu,
      VoidCallback dismiss, {
      VoidCallback? onBrandTap,
    });

class ShellSidebarFrame extends StatelessWidget {
  const ShellSidebarFrame({
    required this.body,
    required this.location,
    this.railBuilder,
    super.key,
  });

  final Widget body;
  final String location;
  final SidebarRailBuilder? railBuilder;

  @override
  Widget build(BuildContext context) {
    final wide =
        shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
        ShellNavigationMode.rail;
    final userId = context.select<AuthCubit?, String?>((auth) {
      final state = auth?.state;
      return state?.status == AuthStatus.authenticated ? state?.user?.id : null;
    });
    return _SidebarPreferenceHost(
      userId: wide ? userId : null,
      wide: wide,
      child: _SidebarFrame(
        location: location,
        railBuilder: railBuilder,
        body: body,
      ),
    );
  }
}

class _SidebarPreferenceHost extends StatefulWidget {
  const _SidebarPreferenceHost({
    required this.userId,
    required this.wide,
    required this.child,
  });

  final String? userId;
  final bool wide;
  final Widget child;

  @override
  State<_SidebarPreferenceHost> createState() => _SidebarPreferenceHostState();
}

class _SidebarPreferenceHostState extends State<_SidebarPreferenceHost> {
  final _cubit = SidebarBehaviorCubit();
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _bind();
  }

  @override
  void didUpdateWidget(_SidebarPreferenceHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.wide != oldWidget.wide || widget.userId != oldWidget.userId) {
      _bind();
    }
  }

  void _bind() {
    if (_started) {
      unawaited(_cubit.bindAccount(widget.userId));
    } else if (widget.wide) {
      _started = true;
      unawaited(_cubit.restore(widget.userId));
    }
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      BlocProvider.value(value: _cubit, child: widget.child);
}

class _SidebarFrame extends StatefulWidget {
  const _SidebarFrame({
    required this.location,
    required this.railBuilder,
    required this.body,
  });

  final String location;
  final SidebarRailBuilder? railBuilder;
  final Widget body;

  @override
  State<_SidebarFrame> createState() => _SidebarFrameState();
}

class _SidebarFrameState extends State<_SidebarFrame>
    with SingleTickerProviderStateMixin {
  final _panelFocus = FocusScopeNode(debugLabel: 'Sidebar overlay');
  final _sidebarFocus = FocusNode(debugLabel: 'Sidebar');
  final _shortcutFocus = FocusNode(debugLabel: 'Shell shortcuts');
  late final _fade = AnimationController(vsync: this)
    ..addStatusListener(_onAnimationStatus);
  Timer? _closeTimer;
  SidebarBehavior? _behavior;
  bool _open = false;
  bool _showPanel = false;
  bool _pointerInside = false;
  bool? _deferredDismissFromPointer;

  void _onAnimationStatus(AnimationStatus status) {
    if (status == AnimationStatus.dismissed && !_open && _showPanel) {
      setState(() => _showPanel = false);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final current = ModalRoute.isCurrentOf(context) ?? true;
    final deferred = _deferredDismissFromPointer;
    if (current && deferred != null) {
      _deferredDismissFromPointer = null;
      _scheduleDismiss(fromPointer: deferred);
    }
  }

  @override
  void didUpdateWidget(_SidebarFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.location != oldWidget.location || widget.railBuilder == null) {
      _dismiss();
    }
  }

  @override
  void dispose() {
    _closeTimer?.cancel();
    _fade.dispose();
    _panelFocus.dispose();
    _sidebarFocus.dispose();
    _shortcutFocus.dispose();
    super.dispose();
  }

  void _reveal({bool transferFocus = false}) {
    _closeTimer?.cancel();
    _deferredDismissFromPointer = null;
    if (!_open) {
      setState(() {
        _open = true;
        _showPanel = true;
      });
      unawaited(_fade.forward());
    }
    if (transferFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _open) _panelFocus.requestFocus();
      });
    }
  }

  void _dismiss() {
    _closeTimer?.cancel();
    _deferredDismissFromPointer = null;
    if (!_open) return;
    setState(() => _open = false);
    if (_panelFocus.hasFocus) _shortcutFocus.requestFocus();
    unawaited(_fade.reverse());
  }

  void _scheduleDismiss({required bool fromPointer}) {
    _closeTimer?.cancel();
    _closeTimer = Timer(const Duration(milliseconds: 180), () {
      if (!mounted || !_open) return;
      // The sidebar owns the popup's anchor and action context.
      if (ModalRoute.of(context)?.isCurrent == false) {
        _deferredDismissFromPointer = fromPointer;
        return;
      }
      final returned = fromPointer ? _pointerInside : _sidebarFocus.hasFocus;
      if (!returned) _dismiss();
    });
  }

  bool _hoverDevice(PointerDeviceKind kind) =>
      kind == PointerDeviceKind.mouse || kind == PointerDeviceKind.trackpad;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<SidebarBehaviorCubit>().state;
    final cubit = context.read<SidebarBehaviorCubit>();
    final behavior =
        state.behavior ?? defaultSidebarBehaviorFor(MediaQuery.sizeOf(context));
    if (_behavior != behavior) {
      _closeTimer?.cancel();
      _deferredDismissFromPointer = null;
      _behavior = behavior;
      _open = false;
      _showPanel = false;
      _pointerInside = false;
      _fade.value = 0;
    }
    final style = ShellChromeStyle.of(context);
    _fade.duration = style.motion(context, const Duration(milliseconds: 150));
    _fade.reverseDuration = _fade.duration;
    final buildRail = widget.railBuilder;
    final canSelect = buildRail != null && state.ready;
    void select(SidebarBehavior value) {
      if (value != behavior) _dismiss();
      unawaited(cubit.setBehavior(value));
    }

    Widget rail(bool extended) => buildRail!(
      extended,
      ShellSidebarModeMenu(
        behavior: behavior,
        onSelected: canSelect ? select : null,
      ),
      _dismiss,
      onBrandTap: behavior == SidebarBehavior.hover && !extended
          ? () => _reveal(transferFocus: true)
          : null,
    );

    final restExtent = switch (behavior) {
      SidebarBehavior.expanded => shellNavigationSidebarExtent,
      SidebarBehavior.minimal => shellSidebarMinimalExtent,
      SidebarBehavior.collapsed ||
      SidebarBehavior.hover => shellNavigationRailExtent,
    };
    final overlay = buildRail != null && behavior.opensAsOverlay;
    final showPanel = overlay && _showPanel;
    return ShellSidebarShortcuts(
      focusNode: _shortcutFocus,
      behavior: behavior,
      onSelected: canSelect ? select : null,
      child: AdaptiveShellFrame(
        railExtent: restExtent,
        railPaintExtent: showPanel ? shellNavigationSidebarExtent : null,
        body: widget.body,
        rail: buildRail == null
            ? null
            : overlay
            ? _overlayRail(context, restExtent, rail, showPanel: showPanel)
            : rail(behavior == SidebarBehavior.expanded),
      ),
    );
  }

  Widget _overlayRail(
    BuildContext context,
    double restExtent,
    Widget Function(bool extended) rail, {
    required bool showPanel,
  }) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final safe = MediaQuery.paddingOf(context);
    final style = ShellChromeStyle.of(context);
    final minimal = _behavior == SidebarBehavior.minimal;
    return MouseRegion(
      hitTestBehavior: HitTestBehavior.deferToChild,
      onEnter: (event) {
        if (!_hoverDevice(event.kind)) return;
        _pointerInside = true;
        _reveal();
      },
      onExit: (event) {
        if (!_hoverDevice(event.kind)) return;
        _pointerInside = false;
        _scheduleDismiss(fromPointer: true);
      },
      child: Focus(
        focusNode: _sidebarFocus,
        skipTraversal: true,
        onFocusChange: (focused) {
          if (focused && !_panelFocus.hasFocus) {
            _reveal(transferFocus: true);
          } else if (!focused && _open) {
            _scheduleDismiss(fromPointer: false);
          }
        },
        child: Stack(
          fit: StackFit.expand,
          clipBehavior: Clip.none,
          children: [
            PositionedDirectional(
              start: 0,
              top: 0,
              bottom: minimal ? null : 0,
              width: restExtent + (rtl ? safe.right : safe.left),
              child: ExcludeFocus(
                excluding: _open,
                child: ExcludeSemantics(
                  excluding: _open,
                  child: IgnorePointer(
                    ignoring: _open,
                    child: minimal
                        ? ShellSidebarLogoTrigger(
                            onTap: () => _reveal(transferFocus: true),
                          )
                        : rail(false),
                  ),
                ),
              ),
            ),
            if (showPanel)
              IgnorePointer(
                ignoring: !_open,
                child: ExcludeFocus(
                  excluding: !_open,
                  child: ExcludeSemantics(
                    excluding: !_open,
                    child: FadeTransition(
                      key: const ValueKey('shell-sidebar-overlay'),
                      opacity: _fade,
                      child: Material(
                        color: style.page,
                        elevation: 8,
                        child: CallbackShortcuts(
                          bindings: {
                            if (_open)
                              const SingleActivator(LogicalKeyboardKey.escape):
                                  _dismiss,
                          },
                          child: FocusScope(
                            node: _panelFocus,
                            child: rail(true),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
