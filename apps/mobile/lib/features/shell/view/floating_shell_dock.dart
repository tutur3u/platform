import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Owns the dock's clearance, including screens with explicit list padding.
/// Clearance remains stable while scrolling so hiding never moves the content.
class FloatingShellDock extends StatefulWidget {
  const FloatingShellDock({
    required this.location,
    required this.bottomInset,
    required this.navigation,
    required this.child,
    super.key,
  });

  final String location;
  final double bottomInset;
  final Widget navigation;
  final Widget child;

  @override
  State<FloatingShellDock> createState() => _FloatingShellDockState();
}

class _FloatingShellDockState extends State<FloatingShellDock> {
  Timer? _returnTimer;
  bool _hidden = false;
  double _travel = 0;

  @override
  void didUpdateWidget(covariant FloatingShellDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.location != widget.location || widget.bottomInset == 0) {
      _returnTimer?.cancel();
      _hidden = false;
      _travel = 0;
    }
  }

  @override
  void dispose() {
    _returnTimer?.cancel();
    super.dispose();
  }

  void _reveal() {
    if (mounted && _hidden) setState(() => _hidden = false);
    _travel = 0;
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 ||
        notification.metrics.axis != Axis.vertical ||
        widget.bottomInset == 0 ||
        MediaQuery.of(context).accessibleNavigation) {
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
        if (_travel > 24 && !_hidden) setState(() => _hidden = true);
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
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.only(bottom: clearance),
            child: MediaQuery(
              data: active
                  ? media.copyWith(
                      padding: media.padding.copyWith(bottom: 0),
                      viewPadding: media.viewPadding.copyWith(bottom: 0),
                    )
                  : media,
              child: widget.child,
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

class _DockActions extends StatelessWidget {
  const _DockActions({required this.location, required this.navigation});
  final String location;
  final Widget navigation;

  @override
  Widget build(BuildContext context) {
    ShellChromeActionsCubit? cubit;
    try {
      cubit = context.read<ShellChromeActionsCubit>();
    } on ProviderNotFoundException {
      return navigation;
    }
    return BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      builder: (context, state) {
        final actions = state
            .resolveForLocation(location)
            .where((a) => a.inDock)
            .toList();
        final visibleCount = MediaQuery.sizeOf(context).width >= 840 ? 2 : 1;
        return AnimatedSize(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeInOutCubic,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(child: navigation),
              for (final action in actions.take(visibleCount))
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Tooltip(
                    message: action.tooltip ?? '',
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(48, 48),
                        padding: EdgeInsets.symmetric(
                          horizontal: MediaQuery.sizeOf(context).width >= 600
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
                            Icon(
                              action.icon,
                              size: 24,
                              semanticLabel: action.tooltip,
                            ),
                          if (MediaQuery.sizeOf(context).width >= 600) ...[
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
                    tooltip: MaterialLocalizations.of(context).showMenuTooltip,
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
        );
      },
    );
  }
}
