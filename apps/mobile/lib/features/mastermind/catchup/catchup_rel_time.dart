import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// "now", "12m", "2h 13m" (under six hours), "5h", "3d", else "Oct 29".
String catchupRelTimeText(AppLocalizations l10n, Duration age, DateTime at) {
  final span = age.isNegative ? Duration.zero : age;
  if (span < const Duration(minutes: 1)) {
    return l10n.mastermindRelNow;
  }
  if (span < const Duration(hours: 1)) {
    return l10n.mastermindRelMinutes(span.inMinutes);
  }
  if (span < const Duration(hours: 6) && span.inMinutes % 60 != 0) {
    return l10n.mastermindRelHoursMinutes(span.inHours, span.inMinutes % 60);
  }
  if (span < const Duration(hours: 24)) {
    return l10n.mastermindRelHours(span.inHours);
  }
  if (span < const Duration(days: 7)) {
    return l10n.mastermindRelDays(span.inDays);
  }
  return Gmt7.day(at, l10n.localeName);
}

/// "Oct 29, 06:21 ICT · Asia/Ho_Chi_Minh", independent of the device zone.
String catchupAbsoluteTime(DateTime at, String locale) =>
    '${DateFormat.MMMd(locale).format(Gmt7.wallTime(at))}, '
    '${Gmt7.time(at, locale)} ICT · Asia/Ho_Chi_Minh';

/// A relative time with the clock glyph. A long press, or a tap on the glyph,
/// shows the absolute time in Asia/Ho_Chi_Minh; screen readers hear both.
///
/// [now] comes from the section's own 30 second ticker, so a screen full of
/// rows keeps one timer.
class CatchupRelTime extends StatefulWidget {
  const CatchupRelTime({required this.at, required this.now, super.key});

  final DateTime at;
  final DateTime now;

  @override
  State<CatchupRelTime> createState() => _CatchupRelTimeState();
}

class _CatchupRelTimeState extends State<CatchupRelTime> {
  final _tooltip = GlobalKey<TooltipState>();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    final relative = catchupRelTimeText(
      l10n,
      widget.now.difference(widget.at),
      widget.at,
    );
    final absolute = catchupAbsoluteTime(widget.at, l10n.localeName);
    final spoken = [
      mastermindAgeText(l10n, widget.now.difference(widget.at)),
      absolute,
    ].join(', ');
    return Semantics(
      label: spoken,
      excludeSemantics: true,
      child: Tooltip(
        key: _tooltip,
        message: absolute,
        triggerMode: TooltipTriggerMode.longPress,
        showDuration: const Duration(seconds: 3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _tooltip.currentState?.ensureTooltipVisible(),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: AppSpacing.sm,
                ),
                child: Icon(LucideIcons.clock, size: 14, color: muted),
              ),
            ),
            Text(
              relative,
              style: tokens.typography.small.copyWith(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}
