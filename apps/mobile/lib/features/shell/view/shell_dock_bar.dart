import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_back.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

/// One dock destination: a glyph, its visible label and its identity.
@immutable
class ShellDockEntry {
  const ShellDockEntry({
    required this.key,
    required this.label,
    required this.glyph,
    this.enabled = true,
  });

  final Key key;
  final String label;

  /// A 22dp icon or image; its own semantics are replaced by [label].
  final Widget glyph;
  final bool enabled;
}

/// Contents of the floating dock pill: destination slots of equal width,
/// with a Back circle and divider in the leading slot when [back] is set.
///
/// The pill's bounds come from its parent and never change here: Back
/// eases in and the slots share whatever width remains.
class ShellDockBar extends StatefulWidget {
  const ShellDockBar({
    required this.entries,
    required this.selectedKey,
    required this.onSelected,
    this.back,
    this.onBackLongPress,
    this.labelled = true,
    super.key,
  });

  final List<ShellDockEntry> entries;

  /// Whether slots show their labels. Module sections show glyphs only: the
  /// top bar already titles the selected section.
  final bool labelled;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;

  /// The Back entry; null at a destination root.
  final ShellDockEntry? back;

  /// Returns to the destination root.
  final VoidCallback? onBackLongPress;

  @override
  State<ShellDockBar> createState() => _ShellDockBarState();
}

class _ShellDockBarState extends State<ShellDockBar> {
  /// Kept while Back eases out so the circle leaves with the motion.
  ShellDockEntry? _lastBack;

  static const _gap = 4.0;
  static const double _backExtent = ShellDockMetrics.slot + _gap * 2 + 1;

  /// Narrower slots show glyphs only; the label stays in semantics.
  static const _minLabelledSlot = 44.0;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final back = widget.back;
    final duration = style.motion(context, style.base);
    // Reduced motion drops Back at once instead of easing it out.
    _lastBack = back ?? (duration == Duration.zero ? null : _lastBack);
    final shown = _lastBack;
    return SizedBox(
      key: const ValueKey('shell-dock-bar'),
      // Inside the surface's edge, so the pill is the full dock height.
      height: ShellDockMetrics.height - ShellDockSurface.edge * 2,
      child: Padding(
        padding: const EdgeInsets.all(
          ShellDockMetrics.padding - ShellDockSurface.edge,
        ),
        child: Row(
          children: [
            if (shown != null)
              TweenAnimationBuilder<double>(
                tween: Tween(end: back == null ? 0 : 1),
                duration: duration,
                curve: Curves.easeOutCubic,
                onEnd: () => WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted && widget.back == null && _lastBack != null) {
                    setState(() => _lastBack = null);
                  }
                }),
                builder: (context, t, child) => ClipRect(
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: t,
                    child: Opacity(opacity: t, child: child),
                  ),
                ),
                child: ExcludeSemantics(
                  excluding: back == null,
                  child: IgnorePointer(
                    ignoring: back == null,
                    child: SizedBox(
                      width: _backExtent,
                      child: Row(
                        children: [
                          ShellDockBack(
                            entry: shown,
                            style: style,
                            onTap: () => _select(shown.key),
                            onLongPress: widget.onBackLongPress,
                          ),
                          const SizedBox(width: _gap),
                          Container(width: 1, height: 28, color: style.border),
                          const SizedBox(width: _gap),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final count = widget.entries.length;
                  final slotWidth = count == 0
                      ? 0.0
                      : constraints.maxWidth / count - _gap;
                  return Row(
                    children: [
                      for (final entry in widget.entries)
                        Expanded(
                          child: _DockSlot(
                            key: entry.key,
                            entry: entry,
                            selected: entry.key == widget.selectedKey,
                            showLabel:
                                widget.labelled &&
                                slotWidth >= _minLabelledSlot,
                            style: style,
                            onTap: () => _select(entry.key),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _select(Key key) {
    unawaited(AppHaptics.selection());
    widget.onSelected(key);
  }
}

class _DockSlot extends StatelessWidget {
  const _DockSlot({
    required this.entry,
    required this.selected,
    required this.showLabel,
    required this.style,
    required this.onTap,
    super.key,
  });

  final ShellDockEntry entry;
  final bool selected;
  final bool showLabel;
  final ShellChromeStyle style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? style.navSelectedInk : style.mutedForeground;
    final label = MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.3,
      child: Text(
        entry.label,
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11,
          height: 14 / 11,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          color: color,
        ),
      ),
    );
    return Semantics(
      container: true,
      button: true,
      selected: selected,
      enabled: entry.enabled,
      label: entry.label,
      excludeSemantics: true,
      onTap: entry.enabled ? onTap : null,
      child: ShellPressShift(
        onTap: entry.enabled ? onTap : null,
        // Hit areas tile the row; the 4dp gap between fills is padding.
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: AnimatedContainer(
            duration: style.motion(context, style.fast),
            height: ShellDockMetrics.slot,
            decoration: ShapeDecoration(
              color: selected
                  ? style.navSelectedFill
                  : style.navSelectedFill.withValues(alpha: 0),
              shape: const StadiumBorder(),
            ),
            child: Opacity(
              opacity: entry.enabled ? 1 : 0.4,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconTheme.merge(
                    data: IconThemeData(color: color, size: 22),
                    child: SizedBox(height: 22, child: entry.glyph),
                  ),
                  if (showLabel) ...[
                    const SizedBox(height: 2),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: label,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
