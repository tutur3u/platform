import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/features/mastermind/view/widgets/collapsible_search.dart';

/// Reveals the search field when the list is pulled down past [threshold]
/// at its top edge. Pull-to-refresh keeps working: this only listens.
class MastermindPullToSearch extends StatefulWidget {
  const MastermindPullToSearch({
    required this.controller,
    required this.child,
    this.threshold = AppSpacing.huge,
    super.key,
  });

  final MastermindSearchController controller;
  final Widget child;
  final double threshold;

  @override
  State<MastermindPullToSearch> createState() => _MastermindPullToSearchState();
}

class _MastermindPullToSearchState extends State<MastermindPullToSearch> {
  double _pulled = 0;

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 || widget.controller.expanded) return false;
    if (notification is ScrollEndNotification) {
      _pulled = 0;
    } else if (notification case OverscrollNotification(
      :final overscroll,
      :final dragDetails?,
    ) when overscroll < 0 && dragDetails.delta.dy > 0) {
      // Clamping physics: the pull past the top arrives as overscroll.
      _pulled -= overscroll;
    } else if (notification case ScrollUpdateNotification(
      :final metrics,
      dragDetails: _?,
    ) when metrics.pixels < metrics.minScrollExtent) {
      // Bouncing physics: the offset itself goes below the top.
      _pulled = metrics.minScrollExtent - metrics.pixels;
    }
    if (_pulled >= widget.threshold) {
      _pulled = 0;
      widget.controller.reveal();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: widget.child,
      );
}
