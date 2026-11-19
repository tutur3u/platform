import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_animated_slots.dart';
import 'package:mobile/features/shell/view/shell_dock_back.dart';
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
    this.iconOnly = false,
    this.glyphId,
  });

  final Key key;
  final String label;

  /// A 22dp icon or image; its own semantics are replaced by [label].
  final Widget glyph;
  final bool enabled;

  /// Shows the glyph without a visible label; [label] stays its name. Used
  /// for destinations that open a menu.
  final bool iconOnly;

  /// What the glyph shows, as a value (its icon). A change cross-fades the
  /// glyph; null leaves the glyph to update in place.
  final Object? glyphId;

  /// The entry as a value, or null when its glyph has no value form.
  Object? get valueIdentity =>
      glyphId == null ? null : (key, label, glyphId, iconOnly, enabled);
}

/// Value identity of dock content: equal identities show the same
/// destinations, so moving between them needs no transition.
@immutable
class ShellDockContentIdentity {
  const ShellDockContentIdentity(this.values);

  final List<Object?> values;

  @override
  bool operator ==(Object other) =>
      other is ShellDockContentIdentity && listEquals(other.values, values);

  @override
  int get hashCode => Object.hashAll(values);
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
          final labels =
              labelled &&
              entries.length < shellDockMaxSlots &&
              slotWidth >= ShellDockMetrics.minSlotWidth;
          // Icon-only slots beside labelled ones keep the label's room, so
          // every glyph sits on one line.
          final reserveLabel = labels && slots.any((e) => !e.iconOnly);
          return Stack(
            children: [
              _SlidingHighlight(
                index: selectedIndex,
                slotWidth: slotWidth,
                style: style,
              ),
              ShellDockAnimatedSlots(
                slots: slots,
                slotWidth: slotWidth,
                builder: (context, entry) => ShellDockSlotButton(
                  key: entry.key,
                  entry: entry,
                  selected: entry.key == shellDockMoreKey
                      ? overflowSelected
                      : entry.key == selectedKey,
                  showLabel: labels && !entry.iconOnly,
                  reserveLabel: reserveLabel,
                  style: style,
                  onTap: () => entry.key == shellDockMoreKey
                      ? _openOverflow(context, overflow)
                      : _select(entry.key),
                ),
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
    final backEntry = back;
    return FloatingDockRail(
      key: const ValueKey('shell-dock-bar'),
      fixedZones: true,
      leading: backEntry == null
          ? null
          : ShellDockBackZone(
              back: backEntry,
              onTap: () => onSelected(backEntry.key),
              onLongPress: onBackLongPress,
            ),
      navigation: entries.length < 2
          ? const SizedBox(height: ShellDockMetrics.height)
          : ShellDockSurface(
              key: const ValueKey('persistent-shell-dock-material'),
              child: pill,
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
    final duration = style.dockMotion(context);
    return AnimatedPositionedDirectional(
      key: const ValueKey('shell-dock-highlight'),
      duration: duration,
      curve: ShellChromeStyle.dockCurve,
      start: slotWidth * (index < 0 ? 0 : index),
      top: 0,
      width: slotWidth,
      height: ShellDockMetrics.slot,
      child: AnimatedOpacity(
        duration: duration,
        curve: ShellChromeStyle.dockCurve,
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
/// [selected]. Narrow and icon-only slots hide the label, keeping its room
/// when [reserveLabel]; semantics always carry it. A new glyph or label
/// cross-fades in place.
class ShellDockSlotButton extends StatelessWidget {
  const ShellDockSlotButton({
    required this.entry,
    required this.selected,
    required this.showLabel,
    required this.style,
    required this.onTap,
    this.reserveLabel = false,
    super.key,
  });

  final ShellDockEntry entry;
  final bool selected;
  final bool showLabel;
  final bool reserveLabel;
  final ShellChromeStyle style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? style.navSelectedInk : style.mutedForeground;
    final duration = style.dockMotion(context);
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
            child: AnimatedOpacity(
              duration: duration,
              curve: ShellChromeStyle.dockCurve,
              opacity: entry.enabled ? 1 : 0.4,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TweenAnimationBuilder<Color?>(
                    tween: ColorTween(end: color),
                    duration: duration,
                    curve: ShellChromeStyle.dockCurve,
                    builder: (context, color, glyph) => IconTheme.merge(
                      data: IconThemeData(
                        color: color,
                        size: ShellDockMetrics.glyphSize,
                      ),
                      child: glyph!,
                    ),
                    child: SizedBox(
                      height: ShellDockMetrics.glyphSize,
                      child: ShellDockCrossFade(
                        duration: duration,
                        child: KeyedSubtree(
                          key: ValueKey(('glyph', entry.glyphId)),
                          child: entry.glyph,
                        ),
                      ),
                    ),
                  ),
                  if (showLabel || reserveLabel) ...[
                    const SizedBox(height: 2),
                    Visibility.maintain(
                      visible: showLabel,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: MediaQuery.withClampedTextScaling(
                          maxScaleFactor: 1.2,
                          child: AnimatedDefaultTextStyle(
                            duration: duration,
                            curve: ShellChromeStyle.dockCurve,
                            style: TextStyle(
                              fontSize: 10,
                              height: 13 / 10,
                              letterSpacing: -0.1,
                              fontWeight: selected
                                  ? FontWeight.w700
                                  : FontWeight.w600,
                              color: color,
                            ),
                            child: ShellDockCrossFade(
                              duration: duration,
                              child: Text(
                                entry.label,
                                key: ValueKey(('label', entry.label)),
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                              ),
                            ),
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
