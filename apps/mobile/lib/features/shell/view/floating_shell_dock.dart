import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_keyboard_chrome.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// The floating header includes the system status bar and the section bar.
double floatingShellHeaderInset(BuildContext context) =>
    MediaQuery.viewPaddingOf(context).top +
    mobileSectionAppBarHeightFor(context) +
    mobileSectionAppBarPadding.vertical;

/// Overlays the dock without shortening the page viewport.
/// Pages consume bottom MediaQuery padding inside their scrollable content.
/// Clearance stays stable while the dock hides so scroll positions never jump.
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
    this.keepNavigationVisible = false,
    super.key,
  });

  final double navigationBottomOffset;
  final bool reserveNavigationClearance;
  final bool keepNavigationVisible;
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
    final clearance = active && widget.reserveNavigationClearance
        ? widget.bottomInset + media.padding.bottom
        : media.padding.bottom;
    final navigationHidden = _hidden && !widget.keepNavigationVisible;
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
              left: 0,
              right: 0,
              bottom: widget.navigationBottomOffset,
              child: SafeArea(
                top: false,
                child: ShellKeyboardChrome(
                  keyboardVisible: widget.keyboardVisible,
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
  const _DockActions({required this.location, required this.navigation});
  final String location;
  final Widget navigation;

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

  @override
  Widget build(BuildContext context) {
    ShellChromeActionsCubit? cubit;
    try {
      cubit = context.read<ShellChromeActionsCubit>();
    } on ProviderNotFoundException {
      return widget.navigation;
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
        // Two compact actions fit beside the flexible navigation on a phone.
        // Keep both primary and secondary actions one tap away (for example,
        // Search and New note) instead of hiding the latter behind a menu.
        final visibleCount = MediaQuery.sizeOf(context).width >= 320 ? 2 : 1;
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: widget.navigation,
              ),
            ),
            DockActionTransition(
              identity: Object.hashAll([
                visibleCount,
                MediaQuery.sizeOf(context).shortestSide >= 600,
                actions.length,
              ]),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final (index, action)
                      in actions.take(visibleCount).indexed)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: ShellDockActionButton(
                        action: action,
                        primary: index == 0,
                      ),
                    ),
                  if (actions.length > visibleCount)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: PopupMenuButton<ShellActionSpec>(
                        tooltip: '',
                        icon: const Icon(Icons.more_horiz),
                        onSelected: (action) {
                          unawaited(AppHaptics.selection());
                          action.onPressed?.call();
                        },
                        itemBuilder: (context) => [
                          for (final action in actions.skip(visibleCount))
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
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
