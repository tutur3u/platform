import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MyTasksHeader extends StatelessWidget {
  const MyTasksHeader({
    required this.overdueCount,
    required this.todayCount,
    required this.upcomingCount,
    super.key,
  });

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
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                greeting,
                style: theme.typography.h2.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                formattedDate,
                style: theme.typography.textMuted,
              ),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _SummaryCard(
                count: overdueCount,
                label: l10n.tasksOverdue,
                icon: Icons.schedule,
                accentColor: theme.colorScheme.destructive,
                backgroundColor: theme.colorScheme.destructive.withValues(
                  alpha: 0.08,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _SummaryCard(
                count: todayCount,
                label: l10n.tasksDueToday,
                icon: Icons.today,
                accentColor: Colors.orange,
                backgroundColor: Colors.orange.withValues(alpha: 0.08),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _SummaryCard(
                count: upcomingCount,
                label: l10n.tasksUpcoming,
                icon: Icons.outlined_flag,
                accentColor: theme.colorScheme.primary,
                backgroundColor: theme.colorScheme.primary.withValues(
                  alpha: 0.08,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.count,
    required this.label,
    required this.icon,
    required this.accentColor,
    required this.backgroundColor,
  });

  final int count;
  final String label;
  final IconData icon;
  final Color accentColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accentColor.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 18, color: accentColor),
          ),
          const SizedBox(height: 12),
          Text(
            '$count',
            style: theme.typography.h4.copyWith(
              color: accentColor,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
