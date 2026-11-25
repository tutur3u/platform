import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Limits for a resizable list/detail split, as fractions of the body.
@immutable
class AppMasterDetailSplitBounds {
  const AppMasterDetailSplitBounds({
    required this.defaultFraction,
    required this.minList,
    required this.maxList,
    required this.minDetail,
  });

  final double defaultFraction;
  final double minList;
  final double maxList;

  /// Smallest share the detail pane keeps.
  final double minDetail;

  double get _max => math.min(maxList, 1 - minDetail);

  /// [fraction] moved into range; a non-finite value takes the default.
  double clamp(double fraction) =>
      fraction.isFinite ? fraction.clamp(minList, _max) : defaultFraction;

  /// A stored [fraction] outside the range is discarded, not clamped.
  double normalize(double fraction) =>
      fraction.isFinite && fraction >= minList && fraction <= _max
      ? fraction
      : defaultFraction;
}

/// A user-resizable list width for `AppMasterDetail`.
@immutable
class AppMasterDetailSplit {
  const AppMasterDetailSplit({
    required this.bounds,
    required this.fraction,
    required this.onChanged,
    required this.onReset,
    required this.semanticLabel,
  });

  final AppMasterDetailSplitBounds bounds;

  /// The list's share of the body.
  final double fraction;

  /// Reports a new share. `persist` is false while a drag is under way and
  /// true once the gesture or key press settles.
  final void Function(double fraction, {required bool persist}) onChanged;
  final VoidCallback onReset;
  final String semanticLabel;
}

bool _desktopPlatform(TargetPlatform platform) => switch (platform) {
  TargetPlatform.macOS ||
  TargetPlatform.windows ||
  TargetPlatform.linux => true,
  _ => false,
};

/// The divider between list and detail. Dragging resizes the list; on
/// desktop, arrow keys step it, Home and End jump to the limits, and a
/// double click restores the default.
class AppMasterDetailSplitHandle extends StatefulWidget {
  const AppMasterDetailSplitHandle({
    required this.split,
    required this.bodyWidth,
    super.key,
  });

  final AppMasterDetailSplit split;
  final double bodyWidth;

  /// Width the handle occupies between the panes.
  static const double extent = 8;

  /// Fraction moved per arrow key press; Shift moves five times as far.
  static const double step = 0.01;

  @override
  State<AppMasterDetailSplitHandle> createState() =>
      _AppMasterDetailSplitHandleState();
}

class _AppMasterDetailSplitHandleState
    extends State<AppMasterDetailSplitHandle> {
  bool _hovered = false;
  bool _focused = false;
  bool _dragging = false;
  double _dragFraction = 0;

  AppMasterDetailSplit get _split => widget.split;

  void _set(double fraction, {required bool persist}) {
    final next = _split.bounds.clamp(fraction);
    _split.onChanged(next, persist: persist);
  }

  void _nudge(double delta) => _set(_split.fraction + delta, persist: true);

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is KeyUpEvent) return KeyEventResult.ignored;
    final step =
        AppMasterDetailSplitHandle.step *
        (HardwareKeyboard.instance.isShiftPressed ? 5 : 1);
    final key = event.logicalKey;
    final directional = Directionality.of(context) == TextDirection.rtl
        ? -1
        : 1;
    if (key == LogicalKeyboardKey.arrowRight) {
      _nudge(step * directional);
    } else if (key == LogicalKeyboardKey.arrowLeft) {
      _nudge(-step * directional);
    } else if (key == LogicalKeyboardKey.home) {
      _set(_split.bounds.minList, persist: true);
    } else if (key == LogicalKeyboardKey.end) {
      _set(1, persist: true);
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  String _percent(double fraction) => '${(fraction * 100).round()}%';

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final desktop = _desktopPlatform(defaultTargetPlatform);
    final active = _hovered || _focused || _dragging;
    final width = widget.bodyWidth;
    final increased = _split.bounds.clamp(
      _split.fraction + AppMasterDetailSplitHandle.step,
    );
    final decreased = _split.bounds.clamp(
      _split.fraction - AppMasterDetailSplitHandle.step,
    );
    return Semantics(
      key: const ValueKey('master-detail-split-handle'),
      container: true,
      slider: true,
      label: _split.semanticLabel,
      value: _percent(_split.fraction),
      increasedValue: _percent(increased),
      decreasedValue: _percent(decreased),
      onIncrease: () => _set(increased, persist: true),
      onDecrease: () => _set(decreased, persist: true),
      child: Focus(
        canRequestFocus: desktop,
        skipTraversal: !desktop,
        onFocusChange: (focused) => setState(() => _focused = focused),
        onKeyEvent: desktop ? _onKey : null,
        child: MouseRegion(
          cursor: SystemMouseCursors.resizeColumn,
          onEnter: (_) => setState(() => _hovered = true),
          onExit: (_) => setState(() => _hovered = false),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            dragStartBehavior: DragStartBehavior.down,
            onDoubleTap: desktop ? _split.onReset : null,
            onHorizontalDragStart: (_) => setState(() {
              _dragging = true;
              _dragFraction = _split.fraction;
            }),
            onHorizontalDragUpdate: (details) {
              if (width <= 0) return;
              final delta = details.primaryDelta ?? 0;
              final directional =
                  Directionality.of(context) == TextDirection.rtl ? -1 : 1;
              _dragFraction += delta * directional / width;
              _set(_dragFraction, persist: false);
            },
            // Events can arrive before a rebuild, so the gesture's own
            // fraction is the one to keep.
            onHorizontalDragEnd: (_) {
              setState(() => _dragging = false);
              _set(_dragFraction, persist: true);
            },
            onHorizontalDragCancel: () {
              setState(() => _dragging = false);
              _set(_dragFraction, persist: true);
            },
            child: SizedBox(
              width: AppMasterDetailSplitHandle.extent,
              child: Center(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  width: active ? 3 : 1,
                  decoration: BoxDecoration(
                    color: active ? colors.ring : colors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
