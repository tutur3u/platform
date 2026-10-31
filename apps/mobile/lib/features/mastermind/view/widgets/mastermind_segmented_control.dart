import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// A compact switch between two to four views of one Mastermind tab.
///
/// The visible track is 32 pt with a 28 pt selected segment, instead of the
/// tall pill of `AppSegmentedControl`, so the list starts higher. Each segment
/// still owns a full-height hit area of at least
/// [AppInterfaceTokens.minTouchTarget] (44 pt): the transparent band above
/// and below the track belongs to the segment under it. Text grows with
/// Dynamic Type; the track grows with it rather than clipping, and when the
/// segments no longer fit across they stack into full-width 44 pt rows.
class MastermindSegmentedControl<T> extends StatelessWidget {
  const MastermindSegmentedControl({
    required this.segments,
    required this.selected,
    required this.onChanged,
    super.key,
  }) : assert(
         segments.length >= 2 && segments.length <= 4,
         'Use two to four segments',
       );

  final List<AppSegment<T>> segments;
  final T selected;
  final ValueChanged<T>? onChanged;

  /// The transparent band between the hit area and the visible track.
  static const double trackInset =
      (AppInterfaceTokens.minTouchTarget - trackHeight) / 2;
  static const double trackHeight = 32;
  static const double _trackPadding = AppSpacing.xxs;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = !_fitsAcross(context, tokens, constraints.maxWidth);
        final track = BoxDecoration(
          color: c.muted.withValues(alpha: solid ? 1 : 0.8),
          borderRadius: BorderRadius.circular(AppRadius.xs + _trackPadding),
          border: solid ? Border.all(color: c.border) : null,
        );
        _Segment<T> segment(AppSegment<T> value) => _Segment<T>(
          segment: value,
          selected: value.value == selected,
          stacked: stacked,
          onTap: onChanged == null ? null : () => onChanged!(value.value),
        );
        if (stacked) {
          // Never a hidden scroller: when the segments cannot sit side by
          // side, each one gets its own full-width 44 pt row.
          return DecoratedBox(
            decoration: track,
            child: Padding(
              padding: const EdgeInsets.all(_trackPadding),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [for (final value in segments) segment(value)],
              ),
            ),
          );
        }
        return Stack(
          children: [
            Positioned.fill(
              top: trackInset,
              bottom: trackInset,
              child: DecoratedBox(decoration: track),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: _trackPadding),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final value in segments)
                      Expanded(child: segment(value)),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  /// Whether the widest word of every label fits its share of [maxWidth]; a
  /// label may wrap between words but never inside one.
  bool _fitsAcross(BuildContext context, AppTokens tokens, double maxWidth) {
    var wordWidth = 0.0;
    var iconWidth = 0.0;
    for (final segment in segments) {
      final words = segment.label.split(' ');
      final parts = words.length > 2
          ? [words.take(2).join(' '), words.skip(2).join(' ')]
          : words;
      if (segment.icon != null) {
        iconWidth = 14 + AppSpacing.xs;
      }
      for (final word in parts) {
        final painter = TextPainter(
          text: TextSpan(
            text: word,
            style: DefaultTextStyle.of(context).style
                .merge(tokens.typography.small)
                .copyWith(fontWeight: FontWeight.w600),
          ),
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout();
        if (painter.width > wordWidth) wordWidth = painter.width;
        painter.dispose();
      }
    }
    final minimum =
        (wordWidth + iconWidth + 2 * AppSpacing.sm + 2) * segments.length +
        2 * _trackPadding;
    return minimum <= maxWidth;
  }
}

class _Segment<T> extends StatefulWidget {
  const _Segment({
    required this.segment,
    required this.selected,
    required this.stacked,
    required this.onTap,
  });

  final AppSegment<T> segment;
  final bool selected;
  final bool stacked;
  final VoidCallback? onTap;

  @override
  State<_Segment<T>> createState() => _SegmentState<T>();
}

class _SegmentState<T> extends State<_Segment<T>> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final selected = widget.selected;
    final foreground = selected ? c.foreground : c.mutedForeground;
    final pad = widget.stacked
        ? 0.0
        : MastermindSegmentedControl.trackInset +
              MastermindSegmentedControl._trackPadding;
    return Semantics(
      container: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      enabled: widget.onTap != null,
      child: FocusableActionDetector(
        enabled: widget.onTap != null,
        onShowFocusHighlight: (value) => setState(() => _focused = value),
        shortcuts: const {
          SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
          SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
        },
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onTap?.call();
              return null;
            },
          ),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppInterfaceTokens.minTouchTarget,
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: pad),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.xxs,
                ),
                decoration: BoxDecoration(
                  color: selected ? c.background : null,
                  borderRadius: BorderRadius.circular(AppRadius.xs),
                  border: Border.all(
                    color: _focused
                        ? c.ring
                        : selected
                        ? c.border
                        : c.border.withValues(alpha: 0),
                    width: _focused ? 2 : 1,
                  ),
                ),
                // Centred without filling a bounded parent's height.
                child: widget.stacked
                    ? Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: _label(tokens, foreground),
                      )
                    : Center(
                        heightFactor: 1,
                        child: _label(tokens, foreground),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(AppTokens tokens, Color foreground) => Row(
    mainAxisSize: widget.stacked ? MainAxisSize.max : MainAxisSize.min,
    children: [
      if (widget.segment.icon case final icon?) ...[
        Icon(icon, size: 14, color: foreground),
        const SizedBox(width: AppSpacing.xs),
      ],
      // No line limit: a label wraps, it is never cut.
      (widget.stacked ? Expanded.new : Flexible.new)(
        child: Text(
          widget.segment.label,
          softWrap: true,
          textAlign: widget.stacked ? TextAlign.start : TextAlign.center,
          style: tokens.typography.small.copyWith(
            color: foreground,
            fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
      if (widget.stacked && widget.selected) ...[
        const SizedBox(width: AppSpacing.xs),
        Icon(AppIcons.check, size: 16, color: foreground),
      ],
    ],
  );
}
