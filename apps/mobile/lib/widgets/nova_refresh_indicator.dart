import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Keeps Material's drag threshold, accessibility, and refresh lifecycle while
/// presenting the same Nova mark used by page and inline loading states.
class NovaRefreshIndicator extends StatefulWidget {
  const NovaRefreshIndicator({
    required this.child,
    required this.onRefresh,
    this.notificationPredicate = defaultScrollNotificationPredicate,
    super.key,
  });

  NovaRefreshIndicator.state({
    required Widget child,
    required this.onRefresh,
    super.key,
  }) : notificationPredicate = defaultScrollNotificationPredicate,
       child = LayoutBuilder(
         builder: (context, constraints) => SingleChildScrollView(
           physics: const AlwaysScrollableScrollPhysics(),
           child: ConstrainedBox(
             constraints: BoxConstraints(
               minHeight: constraints.hasBoundedHeight
                   ? constraints.maxHeight
                   : 0,
             ),
             child: child,
           ),
         ),
       );

  final Widget child;
  final RefreshCallback onRefresh;
  final ScrollNotificationPredicate notificationPredicate;

  @override
  State<NovaRefreshIndicator> createState() => _NovaRefreshIndicatorState();
}

class _NovaRefreshIndicatorState extends State<NovaRefreshIndicator> {
  RefreshIndicatorStatus? _status;
  double _pull = 0;

  void _update(VoidCallback change) {
    if (!mounted) return;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(change);
      });
    } else {
      setState(change);
    }
  }

  bool _onScroll(ScrollNotification notification) {
    if (!widget.notificationPredicate(notification) ||
        notification.metrics.axisDirection != AxisDirection.down) {
      return false;
    }
    var pull = _pull;
    if (notification is ScrollStartNotification) pull = 0;
    if (notification is ScrollUpdateNotification &&
        notification.dragDetails != null) {
      pull =
          (notification.metrics.minScrollExtent - notification.metrics.pixels)
              .clamp(0.0, 150.0);
    }
    if (notification is OverscrollNotification &&
        notification.dragDetails != null &&
        notification.overscroll < 0) {
      pull = (_pull - notification.overscroll).clamp(0.0, 150.0);
    }
    if (pull != _pull) _update(() => _pull = pull);
    return false;
  }

  double _headerOffset(BuildContext context) {
    final dock = context.findAncestorWidgetOfExactType<FloatingShellDock>();
    return dock?.scrollableHeader == true &&
            dock?.header != null &&
            AppModalScope.maybeOf(context) == null
        ? floatingShellHeaderInset(context)
        : 0;
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: RefreshIndicator.noSpinner(
          onRefresh: widget.onRefresh,
          notificationPredicate: widget.notificationPredicate,
          onStatusChange: (status) {
            _update(() => _status = status);
          },
          child: widget.child,
        ),
      ),
      if ((_pull > 8 ||
              _status == RefreshIndicatorStatus.refresh ||
              _status == RefreshIndicatorStatus.armed) &&
          _status != null &&
          _status != RefreshIndicatorStatus.done &&
          _status != RefreshIndicatorStatus.canceled)
        Positioned(
          top: 12 + _headerOffset(context),
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Semantics(
                label: MaterialLocalizations.of(
                  context,
                ).refreshIndicatorSemanticLabel,
                liveRegion: _status == RefreshIndicatorStatus.refresh,
                child: Material(
                  color: Theme.of(context).colorScheme.surfaceContainerHigh,
                  elevation: 4,
                  shape: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(10),
                    child: NovaLoadingIndicator(size: 28),
                  ),
                ),
              ),
            ),
          ),
        ),
    ],
  );
}

/// Fills a bounded viewport so a non-scrolling canvas (such as the month
/// grid) still receives the pull gesture. Under unbounded height it defers
/// to the child's own size instead of throwing.
class RefreshCanvas extends StatelessWidget {
  const RefreshCanvas({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: constraints.hasBoundedHeight ? constraints.maxHeight : null,
        child: child,
      ),
    ),
  );
}
