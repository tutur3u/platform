import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
    this.onVisibilityChanged,
    super.key,
  });

  final String location;
  final double bottomInset;
  final Widget navigation;
  final Widget child;
  final Widget? header;
  final ValueChanged<bool>? onVisibilityChanged;

  @override
  State<FloatingShellDock> createState() => _FloatingShellDockState();
}

class _FloatingShellDockState extends State<FloatingShellDock> {
  Timer? _returnTimer;
  bool _hidden = false;
  bool _headerClearanceConsumed = false;
  bool _atTopWhileHidden = false;
  double _travel = 0;

  @override
  void didUpdateWidget(covariant FloatingShellDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.location != widget.location ||
        (widget.bottomInset == 0 && widget.header == null)) {
      _returnTimer?.cancel();
      _hidden = false;
      _headerClearanceConsumed = false;
      _atTopWhileHidden = false;
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
        if (_atTopWhileHidden) _headerClearanceConsumed = false;
      });
      widget.onVisibilityChanged?.call(true);
    }
    _atTopWhileHidden = false;
    _travel = 0;
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 ||
        notification.metrics.axis != Axis.vertical ||
        (widget.bottomInset == 0 && widget.header == null) ||
        MediaQuery.of(context).accessibleNavigation) {
      return false;
    }
    if (_hidden) {
      _atTopWhileHidden = notification.metrics.pixels <= 0;
    }
    if (_headerClearanceConsumed &&
        notification is ScrollEndNotification &&
        notification.metrics.pixels <= 0 &&
        !_hidden &&
        _travel == 0) {
      setState(() => _headerClearanceConsumed = false);
    }
    if (notification is ScrollUpdateNotification &&
        notification.dragDetails != null &&
        !notification.metrics.outOfRange) {
      final delta = notification.scrollDelta ?? 0;
      if (delta < 0) {
        _reveal();
      } else if (delta > 0) {
        _travel += delta;
        if (_travel > 24 && !_hidden) {
          setState(() {
            _hidden = true;
            _headerClearanceConsumed = true;
          });
          widget.onVisibilityChanged?.call(false);
        }
      }
      _returnTimer?.cancel();
      _returnTimer = Timer(const Duration(milliseconds: 1600), _reveal);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final active = widget.bottomInset > 0;
    final clearance = active ? widget.bottomInset + media.padding.bottom : 0.0;
    final headerClearance = widget.header == null
        ? 0.0
        : media.padding.top + 62;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedPadding(
            // The initial clearance scrolls away with the header. Keep it
            // consumed when the header returns mid-scroll so content stays put.
            duration: media.disableAnimations
                ? Duration.zero
                : const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.only(
              top: _headerClearanceConsumed ? 0 : headerClearance,
            ),
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
              child: SafeArea(
                bottom: false,
                child: IgnorePointer(
                  ignoring: _hidden,
                  child: AnimatedSlide(
                    duration: media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 240),
                    curve: Curves.easeOutCubic,
                    offset: _hidden ? const Offset(0, -1.3) : Offset.zero,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 180),
                      opacity: _hidden ? 0 : 1,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                        child: widget.header,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (active)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(
                top: false,
                child: IgnorePointer(
                  ignoring: _hidden,
                  child: AnimatedSlide(
                    duration: media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 240),
                    curve: Curves.easeOutCubic,
                    offset: _hidden ? const Offset(0, 1.3) : Offset.zero,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 180),
                      opacity: _hidden ? 0 : 1,
                      child: _DockActions(
                        location: widget.location,
                        navigation: widget.navigation,
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
        final visibleCount = MediaQuery.sizeOf(context).width >= 840 ? 2 : 1;
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(child: widget.navigation),
            DockActionTransition(
              identity: Object.hashAll([
                visibleCount,
                MediaQuery.sizeOf(context).shortestSide >= 600,
                actions.length,
              ]),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final action in actions.take(visibleCount))
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: Tooltip(
                        message: action.tooltip ?? '',
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(48, 48),
                            padding: EdgeInsets.symmetric(
                              horizontal:
                                  MediaQuery.sizeOf(context).shortestSide >= 600
                                  ? 16
                                  : 12,
                            ),
                            shape: const StadiumBorder(),
                          ),
                          onPressed: action.enabled && !action.isLoading
                              ? action.onPressed
                              : null,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (action.isLoading)
                                const NovaLoadingIndicator(size: 24)
                              else
                                AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 220),
                                  child: Icon(
                                    action.icon,
                                    key: ValueKey((action.id, action.icon)),
                                    size: 24,
                                    semanticLabel: action.tooltip,
                                  ),
                                ),
                              if (MediaQuery.sizeOf(context).shortestSide >=
                                  600) ...[
                                const SizedBox(width: 8),
                                Text(action.tooltip ?? ''),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  if (actions.length > visibleCount)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: PopupMenuButton<ShellActionSpec>(
                        tooltip: MaterialLocalizations.of(
                          context,
                        ).showMenuTooltip,
                        icon: const Icon(Icons.more_horiz),
                        onSelected: (action) => action.onPressed?.call(),
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
