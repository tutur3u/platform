part of 'shell_page.dart';

extension _ShellPageScroll on _ShellPageState {
  bool _trackPageScroll(String route, ScrollNotification notification) {
    if (notification.depth != 0 ||
        notification.metrics.axis != Axis.vertical ||
        notification.context == null) {
      return false;
    }
    final scrollable = Scrollable.maybeOf(notification.context!);
    if (scrollable != null) {
      _pageScrollables[_normalizeRouteLocation(route)] = WeakReference(
        scrollable,
      );
    }
    return false;
  }

  void _scrollPageToTop(String route) {
    final scrollable = _pageScrollables[_normalizeRouteLocation(route)]?.target;
    if (scrollable == null || !scrollable.mounted) return;
    final position = scrollable.position;
    if (!position.hasPixels || position.pixels <= position.minScrollExtent) {
      return;
    }
    unawaited(
      position.animateTo(
        position.minScrollExtent,
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOutCubic,
      ),
    );
  }
}
