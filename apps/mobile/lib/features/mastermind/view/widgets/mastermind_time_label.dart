import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The zone Mastermind shows absolute times in: the Settings preference when
/// one is resolved (personal, then workspace, then device), else GMT+7.
String mastermindTimeZoneOf(BuildContext context) => mastermindResolvedTimeZone(
  context.watch<TimezoneSettingsCubit?>()?.state.effective,
);

/// The one way a Mastermind time is shown: a relative value ("now", "5m",
/// "2h", "3d", then a short date) followed by a small clock. A long press, a
/// tap on the clock, or Enter / Space on the focused clock shows the
/// absolute time in the user's zone with its offset ("29 Oct, 09:21 GMT+7");
/// keyboard focus shows it too. Screen readers get the spoken age and the
/// absolute time with its offset ("5 minutes ago, 29 October 09:21 GMT+7")
/// and can activate the label to show the tooltip.
///
/// The clock is its own target, at least [kMinInteractiveDimension] square, so
/// the small glyph is never the thing to hit, and the words around it stay part
/// of any row they sit in (a tap there still opens the row).
///
/// [sentence] puts the value into a line such as "Updated {time}"; it is
/// applied to the spoken form too. Every label refreshes on the shared
/// [MastermindClock] tick, so a screen of rows costs one timer.
class MastermindTimeLabel extends StatefulWidget {
  const MastermindTimeLabel(
    this.at, {
    this.sentence,
    this.tooltipKey,
    this.style,
    this.maxLines,
    this.overflow,
    super.key,
  });

  final DateTime at;
  final GlobalKey<TooltipState>? tooltipKey;
  final String Function(String time)? sentence;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  State<MastermindTimeLabel> createState() => _MastermindTimeLabelState();
}

class _MastermindTimeLabelState extends State<MastermindTimeLabel> {
  final _tooltip = GlobalKey<TooltipState>();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    MastermindClock.instance.addListener(_tick);
  }

  @override
  void dispose() {
    MastermindClock.instance.removeListener(_tick);
    super.dispose();
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  GlobalKey<TooltipState> get _tooltipKey => widget.tooltipKey ?? _tooltip;

  void _showAbsolute() => _tooltipKey.currentState?.ensureTooltipVisible();

  void _toggleAbsolute() {
    if (_tooltipKey.currentState?.ensureTooltipVisible() == false) {
      Tooltip.dismissAllToolTips();
    }
  }

  void _focusChanged(bool focused) {
    setState(() => _focused = focused);
    if (focused) _showAbsolute();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final now = MastermindClockScope.nowOf(context);
    final zone = mastermindTimeZoneOf(context);
    final relative = mastermindRelativeTimeText(
      l10n,
      widget.at,
      now: now,
      zone: zone,
      locale: locale,
    );
    final spoken = mastermindSpokenTime(
      l10n,
      widget.at,
      now: now,
      zone: zone,
      locale: locale,
    );
    final absolute = mastermindAbsoluteTimeText(
      widget.at,
      now: now,
      zone: zone,
      locale: locale,
    );
    final sentence = widget.sentence;
    final style = widget.style ?? DefaultTextStyle.of(context).style;
    final iconSize = MediaQuery.textScalerOf(context).scale(12);
    final focusColor = Theme.of(context).colorScheme.primary;
    return Semantics(
      label: sentence == null ? spoken : sentence(spoken),
      hint: l10n.mastermindRelShowExact,
      button: true,
      focusable: true,
      onTap: _showAbsolute,
      onLongPress: _showAbsolute,
      excludeSemantics: true,
      child: Tooltip(
        key: _tooltipKey,
        message: absolute,
        showDuration: const Duration(seconds: 4),
        excludeFromSemantics: true,
        child: Text.rich(
          TextSpan(
            children: [
              TextSpan(text: sentence == null ? relative : sentence(relative)),
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: FocusableActionDetector(
                  onShowFocusHighlight: _focusChanged,
                  actions: {
                    ActivateIntent: CallbackAction<ActivateIntent>(
                      onInvoke: (_) {
                        _toggleAbsolute();
                        return null;
                      },
                    ),
                  },
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _showAbsolute,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        minWidth: kMinInteractiveDimension,
                        minHeight: kMinInteractiveDimension,
                      ),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                          border: Border.all(
                            color: _focused ? focusColor : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: Center(
                          widthFactor: 1,
                          heightFactor: 1,
                          child: Icon(
                            LucideIcons.clock,
                            size: iconSize,
                            color: style.color,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          style: style,
          maxLines: widget.maxLines,
          overflow: widget.overflow,
        ),
      ),
    );
  }
}
