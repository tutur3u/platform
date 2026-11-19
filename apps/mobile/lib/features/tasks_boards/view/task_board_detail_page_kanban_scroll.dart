part of 'task_board_detail_page.dart';

/// Advances a drag viewport proportionally to the pointer's edge penetration.
class _KanbanEdgeScroll {
  Timer? _timer;
  double _delta = 0;

  void update(
    ScrollController controller,
    double position,
    double extent, {
    VoidCallback? onScroll,
  }) {
    final edge = math.min(54, extent / 4);
    _delta = switch (position) {
      < 0 => 0,
      _ when position < edge => -((edge - position) / edge) * 13,
      _ when position > extent => 0,
      _ when position > extent - edge =>
        ((position - extent + edge) / edge) * 13,
      _ => 0,
    };
    if (_delta == 0) {
      stop();
    } else {
      _timer ??= Timer.periodic(const Duration(milliseconds: 16), (_) {
        if (!controller.hasClients) return stop();
        final scroll = controller.position;
        final next = (scroll.pixels + _delta).clamp(
          scroll.minScrollExtent,
          scroll.maxScrollExtent,
        );
        if (next == scroll.pixels) return stop();
        controller.jumpTo(next);
        onScroll?.call();
      });
    }
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
