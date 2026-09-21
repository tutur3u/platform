part of 'custom_navigation_bar.dart';

/// One continuous layout for the island. Retained buttons move, new buttons
/// fade
/// in, and removed buttons fade out without holding the island's old width.
class MorphingNavigationBar extends StatefulWidget {
  const MorphingNavigationBar({
    required this.children,
    required this.selectedKey,
    required this.onSelected,
    super.key,
  });

  final List<shad.NavigationItem> children;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;

  @override
  State<MorphingNavigationBar> createState() => _MorphingNavigationBarState();
}

class _MorphingNavigationBarState extends State<MorphingNavigationBar>
    with SingleTickerProviderStateMixin {
  static const _slot = 52.0;
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 360),
    value: 1,
  );
  Map<Key, _NavigationFrame> _from = {};
  Map<Key, _NavigationFrame> _to = {};
  double _fromWidth = 0;
  double _toWidth = 0;

  double get _progress => Curves.easeInOutCubic.transform(_controller.value);
  double get _width => _lerp(_fromWidth, _toWidth, _progress);

  @override
  void initState() {
    super.initState();
    _to = _targets();
    _from = _to;
    _fromWidth = _toWidth = widget.children.length * _slot + 4;
  }

  Map<Key, _NavigationFrame> _targets() => {
    for (final (index, item) in widget.children.indexed)
      item.key!: _NavigationFrame(item: item, x: index * _slot, opacity: 1),
  };

  Map<Key, _NavigationFrame> _frames() {
    final t = _progress;
    return {
      for (final key in {..._from.keys, ..._to.keys})
        key: _NavigationFrame(
          item: (_to[key] ?? _from[key])!.item,
          x: _lerp((_from[key] ?? _to[key])!.x, (_to[key] ?? _from[key])!.x, t),
          opacity: _lerp(_from[key]?.opacity ?? 0, _to[key]?.opacity ?? 0, t),
        ),
    };
  }

  @override
  void didUpdateWidget(MorphingNavigationBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldKeys = oldWidget.children.map((item) => item.key).toList();
    final newKeys = widget.children.map((item) => item.key).toList();
    if (listEquals(oldKeys, newKeys)) {
      // Update callbacks, icons and enabled state without restarting motion.
      _to = _targets();
      return;
    }
    _from = _frames()..removeWhere((key, frame) => frame.opacity == 0);
    _fromWidth = _width;
    _to = _targets();
    _toWidth = widget.children.length * _slot + 4;
    if (MediaQuery.disableAnimationsOf(context)) {
      _from = _to;
      _fromWidth = _toWidth;
      _controller.value = 1;
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) _controller.value = 1;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        return AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final width = _width.clamp(0.0, constraints.maxWidth);
            final scale = _width > 0 ? (width - 4) / (_width - 4) : 1.0;
            return SizedBox(
              key: const ValueKey('navigation-morph-bounds'),
              width: width,
              height: 52,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  for (final (key, frame) in _frames().entries.map(
                    (entry) => (entry.key, entry.value),
                  ))
                    if (frame.opacity > 0)
                      PositionedDirectional(
                        key: key,
                        start: 2 + frame.x * scale,
                        top: 2,
                        width: _slot * scale,
                        height: 48,
                        child: ExcludeSemantics(
                          excluding: !_to.containsKey(key),
                          child: IgnorePointer(
                            ignoring:
                                !_to.containsKey(key) ||
                                frame.item.enabled == false,
                            child: Opacity(
                              opacity: frame.opacity,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 2,
                                ),
                                child: _CustomNavItem(
                                  isFirst: false,
                                  isLast: false,
                                  isSelected: key == widget.selectedKey,
                                  theme: theme,
                                  isDark: theme.brightness == Brightness.dark,
                                  compact: true,
                                  onTap: () => widget.onSelected(key),
                                  child: frame.item,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _NavigationFrame {
  const _NavigationFrame({
    required this.item,
    required this.x,
    required this.opacity,
  });
  final shad.NavigationItem item;
  final double x;
  final double opacity;
}

double _lerp(double from, double to, double t) => from + (to - from) * t;
