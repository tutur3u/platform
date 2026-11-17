import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Whether [widget] is one of the timeline's horizontally scrolling date
/// surfaces: the header, the all-day bar or the lazily built day grid.
bool isHorizontalDateScroller(Widget widget) =>
    (widget is SingleChildScrollView &&
        widget.scrollDirection == Axis.horizontal) ||
    (widget is ScrollView && widget.scrollDirection == Axis.horizontal);

/// The horizontal date surfaces, in tree order (header first, grid last).
Finder get horizontalDateScrollers =>
    find.byWidgetPredicate(isHorizontalDateScroller);

/// The scroll controller of a horizontal date surface.
ScrollController dateScrollerController(Widget widget) =>
    widget is SingleChildScrollView
    ? widget.controller!
    : (widget as ScrollView).controller!;
