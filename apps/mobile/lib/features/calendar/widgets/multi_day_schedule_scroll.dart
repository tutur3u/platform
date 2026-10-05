part of 'multi_day_schedule_view.dart';

extension _ContinuousDateScroll on _MultiDayScheduleViewState {
  void _resetDateWindow() {
    final date = calendarDate(
      widget.selectedDate.year,
      widget.selectedDate.month,
      widget.selectedDate.day,
    );
    final anchor = widget.alignToWeekStart
        ? _weekStart(date, widget.firstDayOfWeek)
        : date;
    _windowStart = anchor.subtract(Duration(days: _bufferDays));
  }

  void _scheduleDatePosition() {
    if (_positionPending) return;
    _positionPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _positionPending = false;
      if (!mounted) return;
      _positionDates(_bufferDays * _dayWidth);
    });
  }

  void _positionDates(double offset) {
    _syncingHorizontalScroll = true;
    for (final controller in _horizontalControllers) {
      if (controller.hasClients) {
        controller.jumpTo(
          offset.clamp(0.0, controller.position.maxScrollExtent),
        );
      }
    }
    _syncingHorizontalScroll = false;
  }

  bool _settleDateScroll(ScrollEndNotification notification) {
    if (notification.metrics.axis != Axis.horizontal ||
        _syncingHorizontalScroll ||
        _dayWidth == 0 ||
        !_gridController.hasClients) {
      return false;
    }
    final offset = _gridController.offset;
    final index = (offset / _dayWidth).round();
    final leading = _windowStart.add(Duration(days: index));
    final selected = calendarDate(
      widget.selectedDate.year,
      widget.selectedDate.month,
      widget.selectedDate.day,
    );
    // Keep a fixed number of day columns alive. Moving the backing window only
    // after scrolling settles preserves visible dates and the pixel offset.
    if (index < _bufferDays ~/ 2 || index > _bufferDays * 3 ~/ 2) {
      final shift = index - _bufferDays;
      _shiftDateWindow(shift);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _positionDates(offset - shift * _dayWidth);
      });
    }
    final delta = leading.difference(selected).inDays;
    if (delta != 0) {
      _scrollSelection = leading;
      widget.onSwipe(delta);
    }
    return false;
  }
}
