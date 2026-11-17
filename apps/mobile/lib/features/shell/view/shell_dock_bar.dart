import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_back.dart';
import 'package:mobile/features/shell/view/shell_dock_overflow.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';

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

/// The dock's destination pill, led by a fixed Back zone.
///
/// Neither zone changes size. Back fades and scales inside its reserved
/// zone, the pill shows at most [shellDockMaxSlots] equal slots (extra
/// destinations move behind More) and one highlight slides between them, so
/// navigating never shifts or resizes anything in the dock.
///
/// Inside the shell dock ([ownsZones] false) the dock supplies the pill's
/// material and renders Back in its own leading zone (see
/// [ShellDockBackZone]), so the material stays one element while composers
/// and navigation swap inside it.
class ShellDockBar extends StatelessWidget {
  const ShellDockBar({
    required this.entries,
    required this.selectedKey,
    required this.onSelected,
    this.back,
    this.onBackLongPress,
    this.labelled = true,
    this.ownsZones = true,
    super.key,
  });

  final List<ShellDockEntry> entries;

  /// Whether the bar draws its own Back zone and pill material.
  final bool ownsZones;

  /// Whether slots show their labels.
  final bool labelled;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;

  /// The Back entry; null at a destination root.
  final ShellDockEntry? back;

  /// Returns to the destination root.
  final VoidCallback? onBackLongPress;

  /// Narrower slots show glyphs only; the label stays in semantics.
  static const _minLabelledSlot = 44.0;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final pill = Padding(
      padding: const EdgeInsets.all(
        ShellDockMetrics.padding - ShellDockSurface.edge,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // As many slots as keep a 44dp target; the rest sit behind More.
          final (:visible, :overflow) = splitShellDockEntries(
            entries,
            maxSlots: (constraints.maxWidth / ShellDockMetrics.minSlotWidth)
                .floor(),
          );
          final overflowSelected = overflow.any((e) => e.key == selectedKey);
          final slots = [
            ...visible,
            if (overflow.isNotEmpty)
              ShellDockEntry(
                key: shellDockMoreKey,
                label: context.l10n.navMore,
                glyph: const Icon(Icons.more_horiz),
              ),
          ];
          final selectedIndex = overflowSelected
              ? slots.length - 1
              : slots.indexWhere((e) => e.key == selectedKey);
          final slotWidth = slots.isEmpty
              ? 0.0
              : constraints.maxWidth / slots.length;
          return Stack(
            children: [
              _SlidingHighlight(
                index: selectedIndex,
                slotWidth: slotWidth,
                style: style,
              ),
              Row(
                children: [
                  for (final entry in slots)
                    Expanded(
                      child: ShellDockSlotButton(
                        key: entry.key,
                        entry: entry,
                        selected: entry.key == shellDockMoreKey
                            ? overflowSelected
                            : entry.key == selectedKey,
                        showLabel: labelled && slotWidth >= _minLabelledSlot,
                        style: style,
                        onTap: () => entry.key == shellDockMoreKey
                            ? _openOverflow(context, overflow)
                            : _select(entry.key),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
    if (!ownsZones) {
      return SizedBox(
        key: const ValueKey('shell-dock-bar'),
        height: ShellDockMetrics.height - ShellDockSurface.edge * 2,
        child: pill,
      );
    }
    return SizedBox(
      key: const ValueKey('shell-dock-bar'),
      height: ShellDockMetrics.height,
      child: Row(
        children: [
          ShellDockBackZone(
            back: back,
            onTap: back == null ? null : () => onSelected(back!.key),
            onLongPress: onBackLongPress,
          ),
          const SizedBox(width: ShellDockMetrics.zoneGap),
          Expanded(
            child: ShellDockSurface(
              key: const ValueKey('persistent-shell-dock-material'),
              child: pill,
            ),
          ),
        ],
      ),
    );
  }

  void _select(Key key) {
    unawaited(AppHaptics.selection());
    onSelected(key);
  }

  Future<void> _openOverflow(
    BuildContext context,
    List<ShellDockEntry> overflow,
  ) async {
    unawaited(AppHaptics.selection());
    final key = await showShellDockOverflowSheet(
      context: context,
      entries: overflow,
      selectedKey: selectedKey,
    );
    if (key != null) onSelected(key);
  }
}

/// Reserved 52dp zone for Back. Its width never changes: Back fades and
/// scales in place, and the empty zone keeps the pill where it was.
class ShellDockBackZone extends StatefulWidget {
  const ShellDockBackZone({
    required this.back,
    required this.onTap,
    this.onLongPress,
    super.key,
  });

  /// The Back entry; null at a destination root, which leaves the zone
  /// empty.
  final ShellDockEntry? back;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  State<ShellDockBackZone> createState() => _ShellDockBackZoneState();
}

class _ShellDockBackZoneState extends State<ShellDockBackZone> {
  /// Kept while Back fades out so the circle leaves with the motion.
  ShellDockEntry? _last;

  @override
  Widget build(BuildContext context) {
    final back = widget.back;
    final style = ShellChromeStyle.of(context);
    final duration = style.motion(context, style.base);
    _last = back ?? (duration == Duration.zero ? null : _last);
    final shown = _last;
    final visible = back != null;
    return SizedBox(
      key: const ValueKey('shell-dock-back-zone'),
      width: ShellDockMetrics.zone,
      height: ShellDockMetrics.zone,
      child: shown == null
          ? null
          : ExcludeSemantics(
              excluding: !visible,
              child: IgnorePointer(
                ignoring: !visible,
                child: AnimatedScale(
                  scale: visible ? 1 : 0.6,
                  duration: duration,
                  curve: Curves.easeOutCubic,
                  child: AnimatedOpacity(
                    opacity: visible ? 1 : 0,
                    duration: duration,
                    curve: Curves.easeOutCubic,
                    onEnd: () {
                      if (mounted && widget.back == null && _last != null) {
                        setState(() => _last = null);
                      }
                    },
                    child: ShellDockSurface(
                      child: ShellDockBack(
                        entry: shown,
                        style: style,
                        diameter:
                            ShellDockMetrics.zone - ShellDockSurface.edge * 2,
                        filled: false,
                        onTap: () {
                          if (widget.back != null) {
                            unawaited(AppHaptics.selection());
                            widget.onTap?.call();
                          }
                        },
                        onLongPress: widget.onLongPress,
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

/// The one selection fill, which slides between slots instead of each slot
/// growing its own.
class _SlidingHighlight extends StatelessWidget {
  const _SlidingHighlight({
    required this.index,
    required this.slotWidth,
    required this.style,
  });

  final int index;
  final double slotWidth;
  final ShellChromeStyle style;

  @override
  Widget build(BuildContext context) {
    final duration = style.motion(context, style.base);
    return AnimatedPositionedDirectional(
      key: const ValueKey('shell-dock-highlight'),
      duration: duration,
      curve: Curves.easeOutCubic,
      start: slotWidth * (index < 0 ? 0 : index),
      top: 0,
      width: slotWidth,
      height: ShellDockMetrics.slot,
      child: AnimatedOpacity(
        duration: style.motion(context, style.fast),
        opacity: index < 0 ? 0 : 1,
        child: DecoratedBox(
          decoration: ShapeDecoration(
            color: style.navSelectedFill,
            shape: const StadiumBorder(),
          ),
        ),
      ),
    );
  }
}

/// One labelled dock slot: a 22dp glyph over its label, muted unless
/// [selected]. Narrow slots hide the label; semantics always carry it.
class ShellDockSlotButton extends StatelessWidget {
  const ShellDockSlotButton({
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
        child: SizedBox(
          height: ShellDockMetrics.slot,
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
                    child: MediaQuery.withClampedTextScaling(
                      maxScaleFactor: 1.2,
                      child: AnimatedDefaultTextStyle(
                        duration: style.motion(context, style.fast),
                        style: TextStyle(
                          fontSize: 10,
                          height: 13 / 10,
                          letterSpacing: -0.1,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w600,
                          color: color,
                        ),
                        child: Text(
                          entry.label,
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
