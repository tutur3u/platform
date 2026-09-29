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
  bool _pressed = false;
  Key? _previewTarget;
  Key? _settlingTarget;
  Timer? _settlingTimer;

  void _updateDrag(Offset position, double width, double scale) {
    final target = _dragTarget(position, width, scale);
    setState(() => _dragPosition = position);
    if (target == _previewTarget) return;
    _previewTarget = target;
    if (target != null) unawaited(AppHaptics.selection());
  }

  void _clearDrag() {
    setState(() {
      _dragPosition = null;
      _previewTarget = null;
      _pressed = false;
    });
  }

  void _finishDrag(Key? target) {
    _settlingTimer?.cancel();
    setState(() {
      _dragPosition = null;
      _previewTarget = null;
      _pressed = false;
      // Keep the pill at its release position until the parent selects the tab.
      _settlingTarget = target == widget.selectedKey ? null : target;
    });
    if (target == null) return;
    _settlingTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted && _settlingTarget == target) {
        setState(() => _settlingTarget = null);
      }
    });
    unawaited(AppHaptics.drop());
    widget.onSelected(target);
  }

  Key? _dragTarget(Offset position, double width, double scale) {
    if (position.dy < -24 || position.dy > 76) return null;
    final x = Directionality.of(context) == TextDirection.rtl
        ? width - position.dx
        : position.dx;
    final pillCenter = x.clamp(
      2 + _slot * scale / 2,
      (width - 2 - _slot * scale / 2).clamp(
        2 + _slot * scale / 2,
        double.infinity,
      ),
    );
    Key? nearest;
    var distance = double.infinity;
    for (final entry in _frames().entries) {
      if (!_to.containsKey(entry.key) || entry.value.item.enabled == false) {
        continue;
      }
      final center = 2 + (entry.value.x + _slot / 2) * scale;
      final candidateDistance = (center - pillCenter).abs();
      if (candidateDistance < distance) {
        distance = candidateDistance;
        nearest = entry.key;
      }
    }
    return nearest;
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
      _settlingTimer?.cancel();
      _settlingTarget = null;
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
    _settlingTimer?.cancel();
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
            final selectedFrame =
                _frames()[_settlingTarget ?? widget.selectedKey];
            final selectedX = selectedFrame == null
                ? null
                : 2 + selectedFrame.x * scale;
            final highlightX = _dragPosition == null
                ? selectedX
                : (_dragPosition!.dx - _slot * scale / 2).clamp(
                    2.0,
                    (width - _slot * scale - 2).clamp(2.0, double.infinity),
                  );
            return AnimatedScale(
              scale: _pressed ? 1.055 : 1,
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : Duration(milliseconds: _pressed ? 105 : 240),
              curve: Curves.easeOutCubic,
              child: AnimatedContainer(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : Duration(milliseconds: _pressed ? 105 : 240),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(26),
                  boxShadow: _pressed
                      ? [
                          BoxShadow(
                            color: theme.colorScheme.primary.withValues(
                              alpha: 0.5,
                            ),
                            blurRadius: 34,
                            spreadRadius: 5,
                          ),
                        ]
                      : const [],
                ),
                child: SizedBox(
                  key: const ValueKey('navigation-morph-bounds'),
                  width: width,
                  height: 52,
                  child: Listener(
                    onPointerDown: (event) {
                      _updateDrag(event.localPosition, width, scale);
                      setState(() => _pressed = true);
                    },
                    onPointerMove: (event) {
                      if (_pressed) {
                        _updateDrag(event.localPosition, width, scale);
                      }
                    },
                    onPointerUp: (_) => setState(() => _pressed = false),
                    onPointerCancel: (_) => _clearDrag(),
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapUp: (_) => _clearDrag(),
                      onTapCancel: _clearDrag,
                      onPanStart: (details) {
                        unawaited(AppHaptics.pickup());
                        setState(() => _pressed = true);
                        _updateDrag(details.localPosition, width, scale);
                      },
                      onPanUpdate: (details) =>
                          _updateDrag(details.localPosition, width, scale),
                      onPanCancel: _clearDrag,
                      onPanEnd: (_) {
                        final position = _dragPosition;
                        final target = position == null
                            ? null
                            : _dragTarget(position, width, scale);
                        _finishDrag(target);
                      },
                      onLongPressStart: (details) {
                        unawaited(AppHaptics.pickup());
                        setState(() => _pressed = true);
                        _updateDrag(details.localPosition, width, scale);
                      },
                      onLongPressMoveUpdate: (details) =>
                          _updateDrag(details.localPosition, width, scale),
                      onLongPressCancel: _clearDrag,
                      onLongPressEnd: (details) {
                        final target = _dragTarget(
                          details.localPosition,
                          width,
                          scale,
                        );
                        _finishDrag(target);
                      },
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(26),
                              child: BackdropFilter(
                                filter: ImageFilter.blur(
                                  sigmaX: 18,
                                  sigmaY: 18,
                                ),
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.background
                                        .withValues(alpha: 0.82),
                                    border: Border.all(
                                      color: theme.colorScheme.foreground
                                          .withValues(
                                            alpha: _pressed ? 0.28 : 0.13,
                                          ),
                                    ),
                                    borderRadius: BorderRadius.circular(26),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          if (highlightX != null)
                            AnimatedPositioned(
                              duration: MediaQuery.disableAnimationsOf(context)
                                  ? Duration.zero
                                  : _dragPosition != null
                                  ? const Duration(milliseconds: 65)
                                  : const Duration(milliseconds: 390),
                              curve: Curves.easeOutCubic,
                              left: highlightX,
                              top: 2,
                              width: _slot * scale,
                              height: 48,
                              child: IgnorePointer(
                                child: DecoratedBox(
                                  key: _dragPosition == null
                                      ? const ValueKey(
                                          'navigation-selection-indicator',
                                        )
                                      : const ValueKey(
                                          'navigation-drag-preview',
                                        ),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.foreground
                                        .withValues(
                                          alpha: _dragPosition == null
                                              ? 0.14
                                              : 0.22,
                                        ),
                                    // Outer 26px radius minus the 2px inset.
                                    borderRadius: BorderRadius.circular(24),
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
                                        isSelected: false,
                                        theme: theme,
                                        isDark:
                                            theme.brightness == Brightness.dark,
                                        compact: true,
                                        onTap: () {
                                          _clearDrag();
                                          widget.onSelected(key);
                                        },
                                        child: frame.item,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ),
                  ),
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
