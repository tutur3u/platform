import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/l10n/l10n.dart';

/// Read-only profile summary. Shared days never link to private timer history.
class ProfileActivityChart extends StatelessWidget {
  const ProfileActivityChart({required this.activity, super.key});
  final List<DailyActivity> activity;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = Theme.of(context).colorScheme;
    final today = DateUtils.dateOnly(DateTime.now());
    final days = {
      for (final day in activity) DateUtils.dateOnly(day.date): day.duration,
    };
    final locale = Localizations.localeOf(context).toLanguageTag();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.profileRecentActivity,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth.clamp(0.0, 600.0);
            return SizedBox(
              width: width,
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                itemCount: 84,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 14,
                  crossAxisSpacing: 4,
                  mainAxisSpacing: 4,
                ),
                itemBuilder: (context, index) {
                  final date = DateTime(
                    today.year,
                    today.month,
                    today.day - 83 + index,
                  );
                  final seconds = days[date] ?? 0;
                  final message =
                      '${DateFormat.yMMMd(locale).format(date)} · '
                      '${l10n.profileTrackedMinutes(seconds ~/ 60)}';
                  return Tooltip(
                    message: message,
                    triggerMode: TooltipTriggerMode.tap,
                    child: Semantics(
                      label: message,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: seconds == 0
                              ? colors.surfaceContainerHighest
                              : colors.primary.withValues(
                                  alpha:
                                      .3 + .7 * (seconds / 14400).clamp(0, 1),
                                ),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ],
    );
  }
}
