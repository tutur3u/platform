import 'package:flutter/widgets.dart';

/// Keeps visited tabs alive without loading invisible features at startup.
class LazyIndexedStack extends StatefulWidget {
  const LazyIndexedStack({
    required this.index,
    required this.builders,
    super.key,
  });
  final int index;
  final List<WidgetBuilder> builders;
  @override
  State<LazyIndexedStack> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<LazyIndexedStack> {
  final Set<int> _visited = {};
  @override
  Widget build(BuildContext context) {
    _visited.add(widget.index);
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
