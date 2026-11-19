import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';

/// Lays dock slots out at equal widths and animates only what changed.
///
/// Slots keep their element by key, so a retained slot slides to its new
/// place, a new slot fades and scales in, and a removed slot fades out where
/// it was. When no key survives, the whole set changed (another section's
/// destinations) and the slots swap at once; the route transition or the
/// dock's content switcher fades that change.
class ShellDockAnimatedSlots extends StatefulWidget {
  const ShellDockAnimatedSlots({
    required this.slots,
    required this.slotWidth,
    required this.builder,
    super.key,
  });

  final List<ShellDockEntry> slots;
  final double slotWidth;
  final Widget Function(BuildContext context, ShellDockEntry entry) builder;

  @override
  State<ShellDockAnimatedSlots> createState() => _ShellDockAnimatedSlotsState();
}

class _ShellDockAnimatedSlotsState extends State<ShellDockAnimatedSlots> {
  final Map<Key, ({ShellDockEntry entry, double start, double width})>
  _leaving = {};

  /// Keys that slide and enter with motion; a full swap places them at once.
  Set<Key> _entering = {};
  bool _continuous = false;

  @override
  void didUpdateWidget(ShellDockAnimatedSlots oldWidget) {
    super.didUpdateWidget(oldWidget);
    final keys = {for (final entry in widget.slots) entry.key};
    final oldKeys = {for (final entry in oldWidget.slots) entry.key};
    _continuous =
        !MediaQuery.disableAnimationsOf(context) && keys.any(oldKeys.contains);
    _leaving.removeWhere((key, _) => keys.contains(key));
    _entering = _continuous ? keys.difference(oldKeys) : {};
    if (!_continuous) {
      _leaving.clear();
      return;
    }
    for (final (index, entry) in oldWidget.slots.indexed) {
      if (keys.contains(entry.key)) continue;
      _leaving[entry.key] = (
        entry: entry,
        start: index * oldWidget.slotWidth,
        width: oldWidget.slotWidth,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final duration = _continuous
        ? ShellChromeStyle.of(context).dockMotion(context)
        : Duration.zero;
    return SizedBox(
      width: double.infinity,
      height: ShellDockMetrics.slot,
      child: Stack(
        children: [
          for (final MapEntry(:key, value: leaving) in _leaving.entries)
            PositionedDirectional(
              key: ValueKey(('shell-dock-leaving-slot', key)),
              start: leaving.start,
              top: 0,
              width: leaving.width,
              height: ShellDockMetrics.slot,
              child: IgnorePointer(
                child: ExcludeSemantics(
                  child: _SlotReveal(
                    from: 1,
                    to: 0,
                    duration: duration,
                    onEnd: () {
                      if (mounted) setState(() => _leaving.remove(key));
                    },
                    child: widget.builder(context, leaving.entry),
                  ),
                ),
              ),
            ),
          for (final (index, entry) in widget.slots.indexed)
            AnimatedPositionedDirectional(
              key: ValueKey(('shell-dock-slot', entry.key)),
              duration: duration,
              curve: ShellChromeStyle.dockCurve,
              start: index * widget.slotWidth,
              top: 0,
              width: widget.slotWidth,
              height: ShellDockMetrics.slot,
              child: _SlotReveal(
                from: _entering.contains(entry.key) ? 0 : 1,
                to: 1,
                duration: duration,
                child: widget.builder(context, entry),
              ),
            ),
        ],
      ),
    );
  }
}

/// Fades and scales a slot between [from] and [to] once, when first built.
class _SlotReveal extends StatelessWidget {
  const _SlotReveal({
    required this.from,
    required this.to,
    required this.duration,
    required this.child,
    this.onEnd,
  });

  final double from;
  final double to;
  final Duration duration;
  final VoidCallback? onEnd;
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: from, end: to),
    duration: duration,
    curve: ShellChromeStyle.dockCurve,
    onEnd: onEnd,
    builder: (context, value, child) => Opacity(
      opacity: value,
      child: Transform.scale(scale: .85 + .15 * value, child: child),
    ),
    child: child,
  );
}

/// Cross-fades a keyed child in place; the outgoing child takes no space.
class ShellDockCrossFade extends StatelessWidget {
  const ShellDockCrossFade({
    required this.duration,
    required this.child,
    super.key,
  });

  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: duration,
    switchInCurve: ShellChromeStyle.dockCurve,
    switchOutCurve: ShellChromeStyle.dockCurve,
    // Reduced motion shows only the new child; nothing lingers at zero.
    layoutBuilder: (current, previous) => Stack(
      alignment: Alignment.center,
      children: [
        if (duration > Duration.zero)
          for (final child in previous) Positioned.fill(child: child),
        ?current,
      ],
    ),
    child: child,
  );
}
