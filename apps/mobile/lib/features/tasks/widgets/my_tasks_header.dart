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
    final isDark = theme.brightness == Brightness.dark;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final now = DateTime.now();
    final greeting = switch (now.hour) {
      >= 5 && < 12 => l10n.tasksGoodMorning,
      >= 12 && < 18 => l10n.tasksGoodAfternoon,
      >= 18 && < 22 => l10n.tasksGoodEvening,
      _ => l10n.tasksGoodNight,
    };
    final formattedDate = DateFormat.yMMMMEEEEd(locale).format(now);
    const accentColor = Color(0xFF4F8CFF);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? [
                  const Color(0xFF11151D),
                  const Color(0xFF0C1017),
                ]
              : [
                  const Color(0xFFF2F7FF),
                  const Color(0xFFFFFFFF),
                ],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: isDark ? const Color(0xFF1E2633) : const Color(0xFFD4E3FF),
        ),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? const Color(0xFF04070D).withValues(alpha: 0.3)
                : const Color(0xFFBFD4FF).withValues(alpha: 0.28),
            blurRadius: isDark ? 16 : 16,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF121A28)
                        : const Color(0xFFDDE9FF),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isDark
                          ? const Color(0xFF263550)
                          : const Color(0xFFC7DAFF),
                    ),
                  ),
                  child: const Icon(
                    Icons.assignment_outlined,
                    color: accentColor,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        greeting,
                        style: theme.typography.large.copyWith(
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
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _TaskDigestChip(
                        icon: Icons.assignment_turned_in_outlined,
                        label: l10n.tasksTitle,
                        value: '$totalActiveCount',
                        accentColor: const Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _TaskDigestChip(
                        icon: Icons.schedule_outlined,
                        label: l10n.tasksOverdue,
                        value: '$overdueCount',
                        accentColor: const Color(0xFFE11D48),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _TaskDigestChip(
                        icon: Icons.wb_sunny_outlined,
                        label: l10n.tasksDueToday,
                        value: '$todayCount',
                        accentColor: const Color(0xFFB7791F),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _TaskDigestChip(
                        icon: Icons.upcoming_outlined,
                        label: l10n.tasksUpcoming,
                        value: '$upcomingCount',
                        accentColor: const Color(0xFF2563EB),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskDigestChip extends StatelessWidget {
  const _TaskDigestChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.accentColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      constraints: const BoxConstraints(minHeight: 92),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF1A1F28)
            : Color.alphaBlend(
                accentColor.withValues(alpha: 0.12),
                const Color(0xFFF8FAFC),
              ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark
              ? const Color(0xFF2A313D)
              : accentColor.withValues(alpha: 0.18),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(
            icon,
            size: 16,
            color: accentColor,
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: theme.typography.p.copyWith(
                  fontWeight: FontWeight.w800,
                  color: isDark
                      ? Color.alphaBlend(
                          accentColor.withValues(alpha: 0.7),
                          Colors.white,
                        )
                      : accentColor,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: isDark
                      ? theme.colorScheme.mutedForeground
                      : const Color(0xFF475569),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
