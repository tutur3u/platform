import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/l10n/l10n.dart';

/// A day's heading: "Today" or "Yesterday" with the date beside it, or the
/// date alone for older days. Calendar arithmetic keeps daylight-saving days
/// correct.
({String title, String? date}) profileTimelineDayLabel(
  BuildContext context,
  DateTime day,
  DateTime today,
) {
  final locale = Localizations.localeOf(context).toString();
  final date = day.year == today.year
      ? DateFormat.MMMEd(locale).format(day)
      : DateFormat.yMMMEd(locale).format(day);
  final yesterday = DateTime(today.year, today.month, today.day - 1);
  if (day == today) {
    return (title: context.l10n.profileTimelineToday, date: date);
  }
  if (day == yesterday) {
    return (title: context.l10n.profileTimelineYesterday, date: date);
  }
  return (title: date, date: null);
}

/// A day's sticky heading. It paints the page background so rows scroll
/// underneath it while the day stays in view.
class ProfileTimelineDayHeader extends StatelessWidget {
  const ProfileTimelineDayHeader({
    required this.title,
    required this.padding,
    this.date,
    super.key,
  });

  final String title;
  final String? date;

  /// Page gutters; the header spans the full scroll width.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    return ColoredBox(
      color: ShellChromeStyle.of(context).page,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          padding.left + AppSpacing.xs,
          AppSpacing.md,
          padding.right + AppSpacing.xs,
          AppSpacing.sm,
        ),
        child: Semantics(
          header: true,
          label: [title, ?date].join(', '),
          excludeSemantics: true,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.ui.copyWith(
                    color: c.foreground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (date case final date?) ...[
                const SizedBox(width: AppSpacing.sm),
                Text(
                  date,
                  maxLines: 1,
                  style: type.bodySm.copyWith(
                    color: c.mutedForeground,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
