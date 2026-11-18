import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_action_group_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_keyboard_chrome.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// The floating header includes the system status bar and the section bar.
double floatingShellHeaderInset(
  BuildContext context, {
  double minimumContentHeight = mobileSectionAppBarHeight,
}) =>
    MediaQuery.viewPaddingOf(context).top +
    mobileSectionAppBarHeightFor(
      context,
      minimumContentHeight: minimumContentHeight,
    ) +
    shellTopBarPadding.vertical;

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
    this.minimumHeaderContentHeight = mobileSectionAppBarHeight,
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
    this.hideIdleNavigation = false,
    this.fixedZones = false,
    this.leading,
    this.dockPageAction = true,
    super.key,
  });

  final double navigationBottomOffset;

  /// Lays idle navigation out in fixed zones; see
  /// [PersistentShellDock.fixedZones].
  final bool fixedZones;

  /// The Back zone before idle navigation in [fixedZones] mode.
  final Widget? leading;
  final bool dockPageAction;

  /// Set when a leading rail owns navigation; see [PersistentShellDock].
  final bool hideIdleNavigation;
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
  final double minimumHeaderContentHeight;
  final bool scrollableHeader;
  final bool keyboardVisible;
  final ValueChanged<bool>? onVisibilityChanged;

  @override
  State<FloatingShellDock> createState() => _FloatingShellDockState();
}

class _FloatingShellDockState extends State<FloatingShellDock> {
  Timer? _returnTimer;
  bool _hidden = false;
  bool _scrolledUnder = false;

  /// Top of the scrolled viewport when page chrome (a week strip, a range
  /// switcher) sits between it and the header. The separator then marks the
  /// bottom of that composite header instead of the header's own edge.
  double? _separatorEdge;

  /// The page scrollable each location last reported. A revisited root tab
  /// keeps its scroll position, so its separator follows that position; a
  /// newly opened route starts without one.
  final Map<String, WeakReference<ScrollableState>> _scrollables = {};
  double _travel = 0;
  late double _headerInset;
  late bool _accessibleNavigation;
  ShellDockSlotController? _slots;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final slots = ShellDockScope.maybeOf(context);
    if (!identical(slots, _slots)) {
      _slots?.removeListener(_onSlotChanged);
      _slots = slots?..addListener(_onSlotChanged);
    }
    // Theme, default text style, text scale, direction and safe-area changes
    // invalidate this measurement; scroll frames only read the cached value.
    _headerInset = floatingShellHeaderInset(
      context,
      minimumContentHeight: widget.minimumHeaderContentHeight,
    );
    _accessibleNavigation = MediaQuery.of(context).accessibleNavigation;
  }

  @override
  void didUpdateWidget(covariant FloatingShellDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.minimumHeaderContentHeight !=
        widget.minimumHeaderContentHeight) {
      _headerInset = floatingShellHeaderInset(
        context,
        minimumContentHeight: widget.minimumHeaderContentHeight,
      );
    }
    if (oldWidget.location != widget.location) {
      _scrollables.removeWhere((_, ref) => !(ref.target?.mounted ?? false));
      _scrolledUnder = _isScrolledUnder(_scrollables[widget.location]?.target);
      _separatorEdge = null;
    }
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
    _slots?.removeListener(_onSlotChanged);
    super.dispose();
  }

  void _onSlotChanged() {
    // Only the rail layout sizes clearance from the dock's contents.
    if (mounted && widget.hideIdleNavigation) setState(() {});
  }

  /// With a leading rail the dock holds only composers and page actions, so
  /// scroll content reserves its clearance only while one of them is shown.
  bool _dockHasContent(BuildContext context) {
    final slot = _slots?.slot;
    if (widget.allowDockSlot && slot?.location == widget.location) return true;
    final actions = context.watch<ShellChromeActionsCubit?>();
    if (actions == null) return false;
    if (actions.state.actionGroupForLocation(widget.location) != null) {
      return true;
    }
    return actions.state
            .resolveForLocation(widget.location)
            .any((action) => action.inDock) ||
        actions.dockPreviewForLocation(widget.location).isNotEmpty;
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

  static bool _isScrolledUnder(ScrollableState? scrollable) {
    if (scrollable == null || !scrollable.mounted) return false;
    final position = scrollable.position;
    return position.hasPixels && position.pixels > position.minScrollExtent;
  }

  /// Layout and scroll reports of the visible page drive the separator. A
  /// route opened at rest reports only its first layout, which clears the
  /// previous page's separator.
  void _trackScrolledUnder(
    ScrollMetrics metrics,
    int depth,
    BuildContext? scrollContext,
  ) {
    if (depth != 0 || metrics.axis != Axis.vertical) return;
    double? edge;
    if (scrollContext != null) {
      // Offstage root tabs and covered routes keep reporting layout changes.
      if (!TickerMode.getValuesNotifier(scrollContext).value.enabled) return;
      final scrollable = Scrollable.maybeOf(scrollContext);
      if (scrollable != null) {
        _scrollables[widget.location] = WeakReference(scrollable);
        edge = _viewportTopBelowHeader(scrollable);
      }
    }
    final scrolled = metrics.pixels > metrics.minScrollExtent;
    if (scrolled != _scrolledUnder || edge != _separatorEdge) {
      // List content can shrink during layout when a refresh changes state.
      // Defer the separator update until the scroll viewport has settled.
      if (SchedulerBinding.instance.schedulerPhase ==
          SchedulerPhase.persistentCallbacks) {
        final location = widget.location;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted &&
              widget.location == location &&
              (scrollContext?.mounted ?? true)) {
            _trackScrolledUnder(metrics, depth, scrollContext);
          }
        });
        return;
      }
      setState(() {
        _scrolledUnder = scrolled;
        _separatorEdge = edge;
      });
    }
  }

  /// The viewport's top in this dock, when it starts below a fixed header.
  double? _viewportTopBelowHeader(ScrollableState scrollable) {
    if (widget.header == null || widget.scrollableHeader) return null;
    final viewport = scrollable.context.findRenderObject();
    final dock = context.findRenderObject();
    if (viewport is! RenderBox ||
        dock is! RenderBox ||
        !viewport.attached ||
        !viewport.hasSize) {
      return null;
    }
    final top = viewport.localToGlobal(Offset.zero, ancestor: dock).dy;
    return top > _headerInset + 0.5 ? top : null;
  }

  bool _onScrollMetrics(ScrollMetricsNotification notification) {
    _trackScrolledUnder(
      notification.metrics,
      notification.depth,
      notification.context,
    );
    return false;
  }

  bool _onScroll(ScrollNotification notification) {
    _trackScrolledUnder(
      notification.metrics,
      notification.depth,
      notification.context,
    );
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
      _returnTimer?.cancel();
      _returnTimer = Timer(const Duration(milliseconds: 1600), _reveal);
    }
    return false;
  }

  /// Over an ambient appearance the gradient reaches the status bar: the
  /// header is clear where content starts below it, and frosted where root
  /// content scrolls underneath. Solid appearances keep the opaque surface.
  Widget _headerSurface(BuildContext context, Color color, Widget child) {
    if (!AppearanceScope.hasAmbientBackground(context)) {
      final style = ShellChromeStyle.of(context);
      // Content scrolling under the bar shows a hairline and no shadow. A
      // foreground hairline adds no height to the bar.
      return AnimatedContainer(
        key: const ValueKey('floating-shell-header-surface'),
        duration: style.motion(context, style.fast),
        decoration: BoxDecoration(color: color),
        foregroundDecoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: _scrolledUnder && _separatorEdge == null
                  ? style.border
                  : style.border.withValues(alpha: 0),
            ),
          ),
        ),
        child: child,
      );
    }
    if (!widget.scrollableHeader) {
      return ColoredBox(
        key: const ValueKey('floating-shell-header-surface'),
        color: color.withValues(alpha: 0),
        child: child,
      );
    }
    return ClipRect(
      child: GlassBlur(
        sigma: 18,
        child: ColoredBox(
          key: const ValueKey('floating-shell-header-surface'),
          color: color.withValues(alpha: GlassEffects.fillAlpha(context, 0.55)),
          child: child,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final style = ShellChromeStyle.of(context);
    final headerColor = style.page;
    final active = widget.bottomInset > 0;
    final chrome = context.watch<ShellChromeActionsCubit?>()?.state;
    final editorAction =
        chrome
            ?.resolveForLocation(widget.location)
            .any((action) => action.inDock && action.keepVisibleWithKeyboard) ??
        false;
    final editing = editorAction && widget.keyboardVisible;
    final navigationHidden =
        _hidden && !widget.keepNavigationVisible && !editing;
    // An open sheet or dialog takes the dock's room; the dock returns as soon
    // as the overlay starts closing (its registration retires on pop).
    final dockHidden = navigationHidden || (chrome?.modalHidesDock ?? false);
    final reserveClearance =
        widget.reserveNavigationClearance &&
        (!widget.hideIdleNavigation || _dockHasContent(context)) &&
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
              child: NotificationListener<ScrollMetricsNotification>(
                onNotification: _onScrollMetrics,
                child: widget.child,
              ),
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
                    child: _headerSurface(
                      context,
                      headerColor,
                      SafeArea(bottom: false, child: widget.header!),
                    ),
                  ),
                ),
              ),
            ),
          // One hairline under the header and the page chrome below it.
          if (_separatorEdge case final edge?
              when _scrolledUnder &&
                  !AppearanceScope.hasAmbientBackground(context))
            Positioned(
              key: const ValueKey('floating-shell-composite-separator'),
              top: edge - 1,
              left: 0,
              right: 0,
              height: 1,
              child: IgnorePointer(child: ColoredBox(color: style.border)),
            ),
          if (active && !widget.hideIdleNavigation)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              // From the pill's vertical centre to the screen's bottom edge:
              // the veil covers content passing under the dock and below it,
              // never the content above the pill.
              height:
                  ShellDockMetrics.bottomOffset(media.padding.bottom) +
                  ShellDockMetrics.height / 2 +
                  widget.navigationBottomOffset,
              child: IgnorePointer(
                child: AnimatedOpacity(
                  key: const ValueKey('shell-dock-fade'),
                  duration: style.motion(context, style.base),
                  opacity:
                      dockHidden ||
                          (widget.keyboardVisible &&
                              !widget.composerVisible &&
                              !editorAction)
                      ? 0
                      : 1,
                  child: ShellDockFade(color: style.page),
                ),
              ),
            ),
          if (active)
            Positioned(
              left: floatingDockHorizontalInset,
              right: floatingDockHorizontalInset,
              bottom:
                  ShellDockMetrics.bottomOffset(media.padding.bottom) +
                  widget.navigationBottomOffset,
              child: SafeArea(
                top: false,
                bottom: false,
                child: ShellKeyboardChrome(
                  keyboardVisible: widget.keyboardVisible,
                  keepVisible: widget.composerVisible || editorAction,
                  builder: (context, {required hidden, required settled}) =>
                      ExcludeSemantics(
                        excluding: dockHidden || hidden,
                        child: IgnorePointer(
                          ignoring: dockHidden || hidden,
                          child: AnimatedSlide(
                            duration: media.disableAnimations
                                ? Duration.zero
                                : const Duration(milliseconds: 240),
                            curve: Curves.easeOutCubic,
                            offset: dockHidden || hidden
                                ? const Offset(0, 1.3)
                                : Offset.zero,
                            child: AnimatedOpacity(
                              key: const ValueKey(
                                'floating-shell-dock-opacity',
                              ),
                              duration: media.disableAnimations
                                  ? Duration.zero
                                  : const Duration(milliseconds: 180),
                              opacity: dockHidden || hidden ? 0 : 1,
                              child: Offstage(
                                offstage: hidden && settled,
                                child: _DockActions(
                                  location: widget.location,
                                  navigationWidth: widget.navigationWidth,
                                  allowDockSlot: widget.allowDockSlot,
                                  hideIdleNavigation: widget.hideIdleNavigation,
                                  fixedZones: widget.fixedZones,
                                  leading: widget.leading,
                                  dockPageAction: widget.dockPageAction,
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
    required this.hideIdleNavigation,
    required this.fixedZones,
    required this.leading,
    required this.dockPageAction,
  });
  final bool hideIdleNavigation;
  final bool fixedZones;
  final Widget? leading;
  final bool dockPageAction;
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
    required String? workspaceId,
    Widget? primary,
    bool grouped = false,
    bool showPrimary = true,
  }) {
    final controller = ShellDockScope.maybeOf(context);
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
        // A registered action group shows its pill even beside a rail.
        hideIdleNavigation: widget.hideIdleNavigation && !grouped,
        fixedZones: widget.fixedZones,
        leading: widget.leading,
        navigationWidth: widget.navigationWidth,
        primary: active ? slot!.primary : primary,
        showPrimary: active || showPrimary,
      );
    }

    if (controller == null) return dock();
    return ListenableBuilder(listenable: controller, builder: (_, _) => dock());
  }

  @override
  Widget build(BuildContext context) {
    final workspaceId = context.select<WorkspaceCubit?, String?>((cubit) {
      final workspace = cubit?.state;
      return (workspace?.currentWorkspace ??
              workspace?.personalWorkspaceOrCurrent)
          ?.id;
    });
    ShellChromeActionsCubit? cubit;
    try {
      cubit = context.read<ShellChromeActionsCubit>();
    } on ProviderNotFoundException {
      return _registeredDock(widget.navigation, workspaceId: workspaceId);
    }
    return BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      builder: (context, state) {
        final group = state.actionGroupForLocation(widget.location);
        if (group != null) {
          final primary = group.primary;
          // The group replaces navigation and the page action; Back stays.
          return _registeredDock(
            ShellDockActionGroupBar(group: group),
            workspaceId: workspaceId,
            grouped: true,
            primary: primary == null
                ? null
                : ShellDockActionButton(
                    key: ValueKey(('dock-primary', primary.id)),
                    action: ShellActionSpec(
                      id: primary.id,
                      icon: primary.icon,
                      tooltip: primary.label,
                      onPressed: primary.onPressed,
                      enabled: primary.enabled && primary.onPressed != null,
                      inDock: true,
                    ),
                  ),
          );
        }
        final registered = state.registrations.values.any(
          (item) => item.modal || item.locations.contains(widget.location),
        );
        final actions = !registered && _allowPreview
            ? cubit!.dockPreviewForLocation(widget.location)
            : state
                  .resolveForLocation(widget.location)
                  .where((a) => a.inDock)
                  .toList();
        // A sheet's action stays accessible above the covered page.
        final showPrimary =
            widget.dockPageAction || state.topmostModalOwner != null;
        return _registeredDock(
          widget.navigation,
          workspaceId: workspaceId,
          showPrimary: showPrimary,
          primary: !showPrimary || actions.isEmpty
              ? null
              : ShellDockActionButton(
                  key: ValueKey(('dock-primary', actions.first.id)),
                  action: actions.first,
                ),
        );
      },
    );
  }
}
