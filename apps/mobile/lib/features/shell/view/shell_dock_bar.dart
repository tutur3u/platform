import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_back.dart';
import 'package:mobile/features/shell/view/shell_dock_content.dart';
import 'package:mobile/features/shell/view/shell_dock_control.dart';
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

/// Destination slots with a shared selection highlight and overflow sheet.
/// In the shell the surrounding dock supplies the material and Back.
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

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final pill = Padding(
      padding: const EdgeInsets.all(
        ShellDockMetrics.padding - ShellDockSurface.edge,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final (:visible, :overflow) = splitShellDockEntries(
            entries,
            maxSlots: shellDockCapacity(constraints.maxWidth),
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
                        showLabel:
                            labelled &&
                            slots.length < shellDockMaxSlots &&
                            slotWidth >= ShellDockMetrics.minSlotWidth,
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
        height: ShellDockSurface.contentHeight,
        child: pill,
      );
    }
    return SizedBox(
      key: const ValueKey('shell-dock-bar'),
      height: ShellDockMetrics.height,
      child: ShellDockSurface(
        key: const ValueKey('persistent-shell-dock-material'),
        child: ShellDockContent(
          leading: back == null
              ? null
              : ShellDockBackZone(
                  back: back!,
                  onTap: () => onSelected(back!.key),
                  onLongPress: onBackLongPress,
                ),
          child: pill,
        ),
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
    if (context.mounted && key != null) onSelected(key);
  }
}

class ShellDockBackZone extends StatelessWidget {
  const ShellDockBackZone({
    required this.back,
    required this.onTap,
    this.onLongPress,
    super.key,
  });

  final ShellDockEntry back;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) => ShellDockBack(
    entry: back,
    style: ShellChromeStyle.of(context),
    onTap: () {
      unawaited(AppHaptics.selection());
      onTap();
    },
    onLongPress: onLongPress == null
        ? null
        : () {
            unawaited(AppHaptics.selection());
            onLongPress!();
          },
  );
}

/// The shared selection fill slides between slots.
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
            shape: RoundedRectangleBorder(
              borderRadius: ShellDockSurface.innerBorderRadius,
            ),
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
      child: Tooltip(
        message: entry.label,
        triggerMode: TooltipTriggerMode.longPress,
        excludeFromSemantics: true,
        child: ShellDockControl(
          borderRadius: ShellDockSurface.innerBorderRadius,
          onTap: entry.enabled ? onTap : null,
          child: SizedBox(
            height: ShellDockMetrics.slot,
            child: Opacity(
              opacity: entry.enabled ? 1 : 0.4,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconTheme.merge(
                    data: IconThemeData(
                      color: color,
                      size: ShellDockMetrics.glyphSize,
                    ),
                    child: SizedBox(
                      height: ShellDockMetrics.glyphSize,
                      child: entry.glyph,
                    ),
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
      ),
    );
  }
}
