import 'dart:async';

import 'package:flutter/widgets.dart';

/// Keeps visited tabs alive without loading invisible features at startup.
class LazyIndexedStack extends StatefulWidget {
  const LazyIndexedStack({
    required this.index,
    required this.builders,
    this.animate = false,
    super.key,
  });
  final int index;
  final List<WidgetBuilder> builders;
  final bool animate;
  @override
  State<LazyIndexedStack> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<LazyIndexedStack> {
  final Set<int> _visited = {};
  int? _previousIndex;
  int? _enteringIndex;
  Timer? _transitionTimer;

  @override
  void didUpdateWidget(covariant LazyIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index == widget.index || !widget.animate) return;
    _previousIndex = oldWidget.index;
    _enteringIndex = widget.index;
    _visited.add(widget.index);
    _transitionTimer?.cancel();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _enteringIndex == widget.index) {
        setState(() => _enteringIndex = null);
      }
    });
    _transitionTimer = Timer(const Duration(milliseconds: 280), () {
      if (mounted) setState(() => _previousIndex = null);
    });
  }

  @override
  void dispose() {
    _transitionTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _visited.add(widget.index);
    if (widget.animate && !MediaQuery.disableAnimationsOf(context)) {
      return Stack(
        fit: StackFit.expand,
        children: [
          for (var i = 0; i < widget.builders.length; i++)
            Positioned.fill(
              child: Offstage(
                offstage: i != widget.index && i != _previousIndex,
                child: IgnorePointer(
                  ignoring: i != widget.index,
                  child: ExcludeSemantics(
                    excluding: i != widget.index,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 240),
                      curve: Curves.easeOutCubic,
                      opacity: i == widget.index && i != _enteringIndex ? 1 : 0,
                      child: AnimatedSlide(
                        duration: const Duration(milliseconds: 240),
                        curve: Curves.easeOutCubic,
                        offset: i == _enteringIndex
                            ? const Offset(0.025, 0)
                            : i == _previousIndex
                            ? const Offset(-0.025, 0)
                            : Offset.zero,
                        child: TickerMode(
                          enabled: i == widget.index,
                          child: _visited.contains(i)
                              ? widget.builders[i](context)
                              : const SizedBox.shrink(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      );
    }
    return IndexedStack(
      index: widget.index,
      children: [
        for (var i = 0; i < widget.builders.length; i++)
          TickerMode(
            enabled: i == widget.index,
            child: _visited.contains(i)
                ? widget.builders[i](context)
                : const SizedBox.shrink(),
          ),
      ],
    );
  }
}
