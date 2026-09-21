import 'package:flutter/material.dart';
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

  final Widget child;
  final RefreshCallback onRefresh;
  final ScrollNotificationPredicate notificationPredicate;

  @override
  State<NovaRefreshIndicator> createState() => _NovaRefreshIndicatorState();
}

class _NovaRefreshIndicatorState extends State<NovaRefreshIndicator> {
  RefreshIndicatorStatus? _status;
  double _pull = 0;

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
    if (pull != _pull) setState(() => _pull = pull);
    return false;
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
            if (mounted) setState(() => _status = status);
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
          top: 12,
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
