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
  Offset? _dragPosition;
  Key? _previewTarget;
  final _tooltipKeys = <Key, GlobalKey<TooltipState>>{};

  void _updateDrag(Offset position, double width, double scale) {
    final target = _dragTarget(position, width, scale);
    setState(() => _dragPosition = position);
    if (target == _previewTarget) return;
    _previewTarget = target;
    Tooltip.dismissAllToolTips();
    _tooltipKeys[target]?.currentState?.ensureTooltipVisible();
  }

  void _clearDrag() {
    Tooltip.dismissAllToolTips();
    setState(() {
      _dragPosition = null;
      _previewTarget = null;
    });
  }

  Widget _navigationChild(Key key, shad.NavigationItem item) {
    final child = item.child;
    if (child is! Tooltip) return item;
    return Tooltip(
      key: _tooltipKeys.putIfAbsent(key, GlobalKey<TooltipState>.new),
      message: child.message,
      triggerMode: TooltipTriggerMode.manual,
      excludeFromSemantics: true,
      child: child.child,
    );
  }

  Key? _dragTarget(Offset position, double width, double scale) {
    if (position.dy < -24 ||
        position.dy > 76 ||
        position.dx < 0 ||
        position.dx > width) {
      return null;
    }
    final x = Directionality.of(context) == TextDirection.rtl
        ? width - position.dx
        : position.dx;
    for (final entry in _frames().entries) {
      if (!_to.containsKey(entry.key) || entry.value.item.enabled == false) {
        continue;
      }
      final start = 2 + entry.value.x * scale;
      if (x >= start && x < start + _slot * scale) return entry.key;
    }
    return null;
  }

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
    if (!listEquals(oldKeys, newKeys) ||
        oldWidget.selectedKey != widget.selectedKey) {
      _dragPosition = null;
      _previewTarget = null;
      Tooltip.dismissAllToolTips();
    }
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
            final scale = _width > 4
                ? ((width - 4) / (_width - 4)).clamp(0.0, 1.0)
                : 1.0;
            return SizedBox(
              key: const ValueKey('navigation-morph-bounds'),
              width: width,
              height: 52,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onLongPressStart: (details) =>
                    _updateDrag(details.localPosition, width, scale),
                onLongPressMoveUpdate: (details) =>
                    _updateDrag(details.localPosition, width, scale),
                onLongPressCancel: _clearDrag,
                onLongPressEnd: (details) {
                  final target = _dragTarget(
                    details.localPosition,
                    width,
                    scale,
                  );
                  _clearDrag();
                  if (target != null) widget.onSelected(target);
                },
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    if (_dragPosition != null)
                      Positioned(
                        left: (_dragPosition!.dx - _slot * scale / 2).clamp(
                          2.0,
                          (width - _slot * scale - 2).clamp(
                            2.0,
                            double.infinity,
                          ),
                        ),
                        top: 2,
                        width: _slot * scale,
                        height: 48,
                        child: IgnorePointer(
                          child: DecoratedBox(
                            key: const ValueKey('navigation-drag-preview'),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primary.withValues(
                                alpha: 0.2,
                              ),
                              border: Border.all(
                                color: theme.colorScheme.primary.withValues(
                                  alpha: 0.5,
                                ),
                              ),
                              borderRadius: BorderRadius.circular(21),
                            ),
                          ),
                        ),
                      ),
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
                                child: _CustomNavItem(
                                  isFirst: false,
                                  isLast: false,
                                  isSelected:
                                      _dragPosition == null &&
                                      key == widget.selectedKey,
                                  theme: theme,
                                  isDark: theme.brightness == Brightness.dark,
                                  compact: true,
                                  onTap: () => widget.onSelected(key),
                                  child: _navigationChild(key, frame.item),
                                ),
                              ),
                            ),
                          ),
                        ),
                  ],
                ),
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
