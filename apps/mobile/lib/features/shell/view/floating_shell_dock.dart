import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/shell/view/shell_keyboard_chrome.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// The floating header includes the system status bar and the section bar.
double floatingShellHeaderInset(BuildContext context) =>
    MediaQuery.viewPaddingOf(context).top +
    mobileSectionAppBarHeightFor(context) +
    mobileSectionAppBarPadding.vertical;

/// Overlays the dock without shortening the page viewport.
/// Pages consume bottom MediaQuery padding inside their scrollable content.
/// Stable clearance is the default; personal scrolling surfaces opt into
/// reclaiming hidden navigation clearance inside their scroll content.
class FloatingShellDock extends StatefulWidget {
  const FloatingShellDock({
    required this.location,
    required this.bottomInset,
    required this.navigation,
    required this.child,
    this.header,
    this.scrollableHeader = false,
    this.keyboardVisible = false,
    this.onVisibilityChanged,
    this.navigationBottomOffset = 0,
    this.reserveNavigationClearance = true,
    this.reclaimNavigationClearanceWhenHidden = false,
    this.keepNavigationVisible = false,
    this.composerVisible = false,
    this.navigationWidth = 264,
    this.allowDockSlot = true,
    super.key,
  });

  final double navigationBottomOffset;
  final bool reserveNavigationClearance;
  final bool reclaimNavigationClearanceWhenHidden;
  final bool keepNavigationVisible;
  final bool composerVisible;
  final double navigationWidth;
  final bool allowDockSlot;
  final String location;
  final double bottomInset;
  final Widget navigation;
  final Widget child;
  final Widget? header;
  final bool scrollableHeader;
  final bool keyboardVisible;
  final ValueChanged<bool>? onVisibilityChanged;

  @override
  State<FloatingShellDock> createState() => _FloatingShellDockState();
}

class _FloatingShellDockState extends State<FloatingShellDock> {
  Timer? _returnTimer;
  bool _hidden = false;
  double _travel = 0;
  late double _headerInset;
  late bool _accessibleNavigation;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Theme, default text style, text scale, direction and safe-area changes
    // invalidate this measurement; scroll frames only read the cached value.
    _headerInset = floatingShellHeaderInset(context);
    _accessibleNavigation = MediaQuery.of(context).accessibleNavigation;
  }

  @override
  void didUpdateWidget(covariant FloatingShellDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.location != widget.location ||
        oldWidget.keepNavigationVisible != widget.keepNavigationVisible ||
        (widget.bottomInset == 0 && widget.header == null)) {
      _returnTimer?.cancel();
      _hidden = false;
      _travel = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_hidden) widget.onVisibilityChanged?.call(true);
      });
    }
  }

  @override
  void dispose() {
    _returnTimer?.cancel();
    super.dispose();
  }

  void _reveal() {
    if (mounted && _hidden) {
      setState(() {
        _hidden = false;
      });
      widget.onVisibilityChanged?.call(true);
    }
    _travel = 0;
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 ||
        notification.metrics.axis != Axis.vertical ||
        (widget.bottomInset == 0 && widget.header == null) ||
        _accessibleNavigation) {
      return false;
    }
    if (notification is ScrollUpdateNotification &&
        notification.dragDetails != null &&
        !notification.metrics.outOfRange) {
      final delta = notification.scrollDelta ?? 0;
      if (delta < 0) {
        _reveal();
      } else if (delta > 0) {
        _travel += delta;
        final contentClearedHeader =
            !widget.scrollableHeader ||
            notification.metrics.pixels > _headerInset;
        if (_travel > 24 && contentClearedHeader && !_hidden) {
          setState(() {
            _hidden = true;
          });
          widget.onVisibilityChanged?.call(false);
        }
      }
      _returnTimer?.cancel();
    } else if (notification is ScrollEndNotification && _hidden) {
      _returnTimer = Timer(const Duration(milliseconds: 1600), _reveal);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final headerColor =
        context
            .dependOnInheritedWidgetOfExactType<shad.Theme>()
            ?.data
            .colorScheme
            .background ??
        Theme.of(context).colorScheme.surface;
    final active = widget.bottomInset > 0;
    final navigationHidden = _hidden && !widget.keepNavigationVisible;
    final reserveClearance =
        widget.reserveNavigationClearance &&
        !(widget.reclaimNavigationClearanceWhenHidden &&
            (navigationHidden || widget.keyboardVisible));
    final clearance = active && reserveClearance
        ? widget.bottomInset + media.padding.bottom
        : media.padding.bottom;
    final headerClearance = widget.header == null || widget.scrollableHeader
        ? 0.0
        : _headerInset;
    final headerHidden = _hidden && widget.scrollableHeader;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.only(top: headerClearance),
            child: MediaQuery(
              data: active
                  ? media.copyWith(
                      padding: media.padding.copyWith(bottom: clearance),
                    )
                  : media,
              child: widget.child,
            ),
          ),
          if (widget.header != null)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: IgnorePointer(
                ignoring: headerHidden,
                child: AnimatedSlide(
                  duration: media.disableAnimations
                      ? Duration.zero
                      : const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  offset: headerHidden ? const Offset(0, -1.3) : Offset.zero,
                  child: AnimatedOpacity(
                    duration: media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 180),
                    opacity: headerHidden ? 0 : 1,
                    child: ColoredBox(
                      key: const ValueKey('floating-shell-header-surface'),
                      color: headerColor,
                      child: SafeArea(bottom: false, child: widget.header!),
                    ),
                  ),
                ),
              ),
            ),
          if (active)
            Positioned(
              left: floatingDockHorizontalInset,
              right: floatingDockHorizontalInset,
              bottom: floatingDockBottomGap + widget.navigationBottomOffset,
              child: SafeArea(
                top: false,
                child: ShellKeyboardChrome(
                  keyboardVisible: widget.keyboardVisible,
                  keepVisible: widget.composerVisible,
                  builder: (context, {required hidden, required settled}) =>
                      ExcludeSemantics(
                        excluding: navigationHidden || hidden,
                        child: IgnorePointer(
                          ignoring: navigationHidden || hidden,
                          child: AnimatedSlide(
                            duration: media.disableAnimations
                                ? Duration.zero
                                : const Duration(milliseconds: 240),
                            curve: Curves.easeOutCubic,
                            offset: navigationHidden || hidden
                                ? const Offset(0, 1.3)
                                : Offset.zero,
                            child: AnimatedOpacity(
                              key: const ValueKey(
                                'floating-shell-dock-opacity',
                              ),
                              duration: media.disableAnimations
                                  ? Duration.zero
                                  : const Duration(milliseconds: 180),
                              opacity: navigationHidden || hidden ? 0 : 1,
                              child: Offstage(
                                offstage: hidden && settled,
                                child: _DockActions(
                                  location: widget.location,
                                  navigationWidth: widget.navigationWidth,
                                  allowDockSlot: widget.allowDockSlot,
                                  navigation: widget.navigation,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DockActions extends StatefulWidget {
  const _DockActions({
    required this.location,
    required this.navigation,
    required this.navigationWidth,
    required this.allowDockSlot,
  });
  final String location;
  final Widget navigation;
  final double navigationWidth;
  final bool allowDockSlot;

  @override
  State<_DockActions> createState() => _DockActionsState();
}

class _DockActionsState extends State<_DockActions> {
  Timer? _handoffTimer;
  bool _allowPreview = true;

  @override
  void initState() {
    super.initState();
    _startHandoff();
  }

  void _startHandoff() {
    _handoffTimer?.cancel();
    _allowPreview = true;
    _handoffTimer = Timer(const Duration(milliseconds: 320), () {
      if (mounted) setState(() => _allowPreview = false);
    });
  }

  @override
  void didUpdateWidget(_DockActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.location != widget.location) _startHandoff();
  }

  @override
  void dispose() {
    _handoffTimer?.cancel();
    super.dispose();
  }

  Widget _registeredDock(
    Widget navigation, {
    Widget? primary,
    Widget? secondary,
  }) {
    final controller = ShellDockScope.maybeOf(context);
    final workspace = context.watch<WorkspaceCubit?>()?.state;
    final workspaceId =
        (workspace?.currentWorkspace ?? workspace?.personalWorkspaceOrCurrent)
            ?.id;
    Widget dock() {
      final slot = controller?.slot;
      final active =
          widget.allowDockSlot &&
          slot?.location == widget.location &&
          (slot?.workspaceId == null || slot?.workspaceId == workspaceId);
      return PersistentShellDock(
        content: active && slot!.composing ? slot.content : navigation,
        composing: active && slot!.composing,
        expandContent: !active || slot!.expandContent,
        navigationWidth: widget.navigationWidth,
        primary: active ? slot!.primary : primary,
        secondary: active && slot!.composing ? null : secondary,
      );
    }

    if (controller == null) return dock();
    return ListenableBuilder(listenable: controller, builder: (_, _) => dock());
  }

  @override
  Widget build(BuildContext context) {
    ShellChromeActionsCubit? cubit;
    try {
      cubit = context.read<ShellChromeActionsCubit>();
    } on ProviderNotFoundException {
      return _registeredDock(widget.navigation);
    }
    return BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      builder: (context, state) {
        final registered = state.registrations.values.any(
          (item) => item.locations.contains(widget.location),
        );
        final actions = !registered && _allowPreview
            ? cubit!.dockPreviewForLocation(widget.location)
            : state
                  .resolveForLocation(widget.location)
                  .where((a) => a.inDock)
                  .toList();
        // Narrow docks keep secondary actions in the top navbar and reserve
        // one primary slot; wider docks add a second fixed slot.
        return _registeredDock(
          widget.navigation,
          primary: actions.isEmpty
              ? null
              : ShellDockActionButton(
                  key: ValueKey(('dock-primary', actions.first.id)),
                  action: actions.first,
                ),
          secondary: actions.length < 2
              ? null
              : actions.length == 2
              ? ShellDockActionButton(
                  key: ValueKey(('dock-secondary', actions[1].id)),
                  action: actions[1],
                  primary: false,
                )
              : PopupMenuButton<ShellActionSpec>(
                  tooltip: context.l10n.navMore,
                  icon: const Icon(Icons.more_horiz),
                  onSelected: (action) {
                    unawaited(AppHaptics.selection());
                    action.onPressed?.call();
                  },
                  itemBuilder: (context) => [
                    for (final action in actions.skip(1))
                      PopupMenuItem(
                        value: action,
                        enabled: action.enabled && !action.isLoading,
                        child: ListTile(
                          leading: Icon(action.icon),
                          title: Text(action.tooltip ?? ''),
                          dense: true,
                        ),
                      ),
                  ],
                ),
        );
      },
    );
  }
}
