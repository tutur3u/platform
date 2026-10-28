import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
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
/// Dynamic Type; the track grows with it rather than clipping.
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
    return Stack(
      children: [
        Positioned.fill(
          top: trackInset,
          bottom: trackInset,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: c.muted.withValues(alpha: solid ? 1 : 0.8),
              borderRadius: BorderRadius.circular(AppRadius.xs + _trackPadding),
              border: solid ? Border.all(color: c.border) : null,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: _trackPadding),
          child: Row(
            children: [
              for (final segment in segments)
                Expanded(
                  child: _Segment<T>(
                    segment: segment,
                    selected: segment.value == selected,
                    onTap: onChanged == null
                        ? null
                        : () => onChanged!(segment.value),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Segment<T> extends StatefulWidget {
  const _Segment({
    required this.segment,
    required this.selected,
    required this.onTap,
  });

  final AppSegment<T> segment;
  final bool selected;
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
    const pad =
        MastermindSegmentedControl.trackInset +
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
              padding: const EdgeInsets.symmetric(vertical: pad),
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
                        : Colors.transparent,
                    width: _focused ? 2 : 1,
                  ),
                ),
                // Centred without filling a bounded parent's height.
                child: Center(
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
    mainAxisSize: MainAxisSize.min,
    children: [
      if (widget.segment.icon case final icon?) ...[
        Icon(icon, size: 14, color: foreground),
        const SizedBox(width: AppSpacing.xs),
      ],
      Flexible(
        child: Text(
          widget.segment.label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.small.copyWith(
            color: foreground,
            fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
    ],
  );
}
