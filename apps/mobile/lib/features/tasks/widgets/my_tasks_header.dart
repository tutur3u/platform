import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MyTasksHeader extends StatelessWidget {
  const MyTasksHeader({
    required this.totalActiveCount,
    required this.overdueCount,
    required this.todayCount,
    required this.upcomingCount,
    super.key,
  });

  final int totalActiveCount;
  final int overdueCount;
  final int todayCount;
  final int upcomingCount;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final now = DateTime.now();
    final greeting = switch (now.hour) {
      >= 5 && < 12 => l10n.tasksGoodMorning,
      >= 12 && < 18 => l10n.tasksGoodAfternoon,
      >= 18 && < 22 => l10n.tasksGoodEvening,
      _ => l10n.tasksGoodNight,
    };
    final formattedDate = DateFormat.yMMMMEEEEd(locale).format(now);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          greeting,
          style: theme.typography.h4.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          formattedDate,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _MetaChip(
              label: l10n.tasksTitle,
              value: totalActiveCount,
              foregroundColor: theme.colorScheme.foreground,
              backgroundColor: theme.colorScheme.muted,
            ),
            _MetaChip(
              label: l10n.tasksOverdue,
              value: overdueCount,
              foregroundColor: theme.colorScheme.destructive,
              backgroundColor: theme.colorScheme.destructive.withValues(
                alpha: 0.08,
              ),
            ),
            _MetaChip(
              label: l10n.tasksDueToday,
              value: todayCount,
              foregroundColor: const Color(0xFFE59A12),
              backgroundColor: const Color(0xFFE59A12).withValues(alpha: 0.1),
            ),
            _MetaChip(
              label: l10n.tasksUpcoming,
              value: upcomingCount,
              foregroundColor: theme.colorScheme.mutedForeground,
              backgroundColor: theme.colorScheme.muted,
            ),
          ],
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.label,
    required this.value,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  final String label;
  final int value;
  final Color foregroundColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$value',
            style: theme.typography.small.copyWith(
              color: foregroundColor,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
