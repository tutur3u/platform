import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One action exposed by [AppSwipeActions].
class AppSwipeAction {
  const AppSwipeAction({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.tone = AppTone.primary,
    this.key,
  });

  final String label;
  final IconData icon;
  final FutureOr<void> Function() onPressed;
  final AppTone tone;
  final Key? key;
}

/// Swipe affordances for a list row.
///
/// Swiping toward the end edge past the commit threshold runs [leading]
/// (for example Complete). Swiping toward the start edge reveals [trailing]
/// as buttons that stay open until one is tapped or the row is tapped,
/// dragged back or scrolled away. Every action is also published as a
/// custom semantics action, so assistive technology never needs the gesture.
///
/// The row owns no data: callers run their existing mutations from
/// [AppSwipeAction.onPressed] and rebuild from their own state.
class AppSwipeActions extends StatefulWidget {
  const AppSwipeActions({
    required this.child,
    this.leading,
    this.trailing = const [],
    this.enabled = true,
    super.key,
  });

  final Widget child;
  final AppSwipeAction? leading;
  final List<AppSwipeAction> trailing;
  final bool enabled;

  /// Base width of one revealed trailing button before text scaling.
  static const double actionWidth = 76;

  /// Share of the row width a leading swipe must cross to commit.
  static const double commitFraction = 0.35;

  /// Share of the row width a fling must travel before its velocity alone
  /// can commit the leading action, so a flick while scrolling never
  /// completes a task.
  static const double flingMinFraction = 0.15;

  @override
  State<AppSwipeActions> createState() => _AppSwipeActionsState();
}

class _AppSwipeActionsState extends State<AppSwipeActions>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController.unbounded(
    vsync: this,
  )..addListener(() => setState(() {}));

  double _width = 0;
  bool _armed = false;

  /// Logical offset: positive toward the end edge, negative toward start.
  double get _offset => _controller.value;

  bool get _rtl => Directionality.of(context) == TextDirection.rtl;

  bool get _reduceMotion => MediaQuery.disableAnimationsOf(context);

  /// Width of the open trailing buttons: wider with enlarged text, but
  /// always leaving part of the row visible so a tap can close it.
  double get _revealWidth {
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    final natural =
        widget.trailing.length * AppSwipeActions.actionWidth * scale;
    return _width <= 0 ? natural : math.min(natural, _width * 0.75);
  }

  @override
  void didUpdateWidget(covariant AppSwipeActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled && _offset != 0) _controller.value = 0;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails details) {
    final delta = (_rtl ? -1 : 1) * (details.primaryDelta ?? 0);
    final maxLeading = widget.leading == null ? 0.0 : _width;
    final maxTrailing = widget.trailing.isEmpty ? 0.0 : _revealWidth * 1.25;
    final next = (_offset + delta).clamp(-maxTrailing, maxLeading);
    _controller.value = next;
    final armed = next >= _width * AppSwipeActions.commitFraction;
    if (armed != _armed) {
      _armed = armed;
      if (armed) unawaited(AppHaptics.selection());
    }
  }

  void _onDragEnd(DragEndDetails details) {
    final velocity = (_rtl ? -1 : 1) * details.primaryVelocity!;
    if (_offset > 0) {
      final flung =
          velocity > 900 &&
          _offset >= _width * AppSwipeActions.flingMinFraction;
      final commit = _armed || (flung && widget.leading != null);
      _armed = false;
      _settle(0);
      if (commit) _run(widget.leading!);
      return;
    }
    final open = _offset < -_revealWidth / 2 || velocity < -700;
    _settle(open && widget.trailing.isNotEmpty ? -_revealWidth : 0);
  }

  void _settle(double target) {
    if (_reduceMotion) {
      _controller.value = target;
      return;
    }
    unawaited(
      _controller.animateTo(
        target,
        duration: AppMotion.normal,
        curve: AppMotion.standard,
      ),
    );
  }

  void _run(AppSwipeAction action) {
    _settle(0);
    unawaited(Future.sync(action.onPressed));
  }

  @override
  Widget build(BuildContext context) {
    final actions = [
      if (widget.leading != null) widget.leading!,
      ...widget.trailing,
    ];
    final open = _offset != 0;
    return Semantics(
      customSemanticsActions: widget.enabled
          ? {
              for (final action in actions)
                CustomSemanticsAction(label: action.label): () => _run(action),
            }
          : null,
      child: LayoutBuilder(
        builder: (context, constraints) {
          _width = constraints.maxWidth;
          return GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragUpdate: widget.enabled ? _onDragUpdate : null,
            onHorizontalDragEnd: widget.enabled ? _onDragEnd : null,
            child: ClipRect(
              child: Stack(
                children: [
                  // Keep the tree shape fixed so the row is never remounted
                  // while it opens or closes.
                  Positioned.fill(
                    child: !open
                        ? const SizedBox.shrink()
                        : _offset > 0
                        ? _LeadingBackground(
                            action: widget.leading!,
                            armed: _armed,
                          )
                        : _TrailingButtons(
                            actions: widget.trailing,
                            width: -_offset,
                            onPressed: _run,
                          ),
                  ),
                  Transform.translate(
                    offset: Offset(_rtl ? -_offset : _offset, 0),
                    // An open row closes on tap instead of activating.
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onTap: open ? () => _settle(0) : null,
                      child: AbsorbPointer(
                        absorbing: open,
                        child: widget.child,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Label colour on a solid [AppTone] fill, from the theme tokens: the
/// paired foreground roles where the scheme defines one, otherwise whichever
/// of the page foreground and background reads better on the fill.
Color _labelOn(AppColorTokens colors, AppTone tone) {
  switch (tone) {
    case AppTone.primary:
      return colors.primaryForeground;
    case AppTone.destructive:
      return colors.destructiveForeground;
    case AppTone.neutral:
      return colors.foreground;
    case AppTone.info:
    case AppTone.success:
    case AppTone.warning:
      final fill = tone.foreground(colors);
      return _contrast(colors.foreground, fill) >=
              _contrast(colors.background, fill)
          ? colors.foreground
          : colors.background;
  }
}

double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

class _LeadingBackground extends StatelessWidget {
  const _LeadingBackground({required this.action, required this.armed});

  final AppSwipeAction action;
  final bool armed;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final fill = armed ? action.tone.foreground(colors) : colors.muted;
    final ink = armed ? _labelOn(colors, action.tone) : colors.mutedForeground;
    return ColoredBox(
      color: fill,
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Padding(
          padding: const EdgeInsetsDirectional.only(start: AppSpacing.xl),
          child: _ActionFace(action: action, color: ink),
        ),
      ),
    );
  }
}

class _TrailingButtons extends StatelessWidget {
  const _TrailingButtons({
    required this.actions,
    required this.width,
    required this.onPressed,
  });

  final List<AppSwipeAction> actions;
  final double width;
  final ValueChanged<AppSwipeAction> onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return Align(
      alignment: AlignmentDirectional.centerEnd,
      child: SizedBox(
        width: width,
        child: Row(
          children: [
            for (final action in actions)
              Expanded(
                child: Material(
                  key: action.key,
                  color: action.tone.foreground(colors),
                  child: InkWell(
                    onTap: () => onPressed(action),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Center(
                        child: _ActionFace(
                          action: action,
                          color: _labelOn(colors, action.tone),
                          // Show labels once each button can hold one.
                          compact: width < actions.length * 44,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionFace extends StatelessWidget {
  const _ActionFace({
    required this.action,
    required this.color,
    this.compact = false,
  });

  final AppSwipeAction action;
  final Color color;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final typography = AppTokens.of(context).typography;
    // Labels wrap within the button width; enlarged text that still does
    // not fit the row height scales down instead of overflowing. The
    // semantics actions carry the full labels.
    return ExcludeSemantics(
      child: LayoutBuilder(
        builder: (context, constraints) => FittedBox(
          fit: BoxFit.scaleDown,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: constraints.maxWidth.isFinite
                  ? constraints.maxWidth
                  : AppSwipeActions.actionWidth,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(action.icon, color: color, size: 20),
                  if (!compact) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      action.label,
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: typography.xSmall.copyWith(
                        color: color,
                        fontWeight: FontWeight.w600,
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
