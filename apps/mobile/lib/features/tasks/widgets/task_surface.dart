import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskSurfaceStatData {
  const TaskSurfaceStatData({
    required this.label,
    required this.value,
    this.accentColor,
  });

  final String label;
  final String value;
  final Color? accentColor;
}

class TaskSurfacePane extends StatelessWidget {
  const TaskSurfacePane({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(18),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card.withValues(alpha: 0.84),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.78),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class TaskSurfaceHero extends StatelessWidget {
  const TaskSurfaceHero({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.accentColor,
    super.key,
    this.stats = const <TaskSurfaceStatData>[],
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color accentColor;
  final List<TaskSurfaceStatData> stats;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final gradientColors = isDark
        ? [
            Color.alphaBlend(
              accentColor.withValues(alpha: 0.14),
              theme.colorScheme.card,
            ),
            theme.colorScheme.card.withValues(alpha: 0.98),
            Color.alphaBlend(
              accentColor.withValues(alpha: 0.06),
              theme.colorScheme.card,
            ),
          ]
        : [
            accentColor.withValues(alpha: 0.18),
            theme.colorScheme.card.withValues(alpha: 0.96),
            theme.colorScheme.card.withValues(alpha: 0.98),
          ];

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: gradientColors,
        ),
        border: Border.all(
          color: accentColor.withValues(alpha: isDark ? 0.18 : 0.22),
        ),
        boxShadow: [
          BoxShadow(
            color: accentColor.withValues(alpha: isDark ? 0.05 : 0.08),
            blurRadius: isDark ? 18 : 34,
            offset: Offset(0, isDark ? 10 : 18),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: Stack(
          children: [
            Positioned(
              top: -26,
              right: -16,
              child: Container(
                width: 132,
                height: 132,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accentColor.withValues(alpha: isDark ? 0.08 : 0.12),
                ),
              ),
            ),
            Positioned(
              bottom: -42,
              left: -24,
              child: Container(
                width: 148,
                height: 148,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accentColor.withValues(alpha: isDark ? 0.05 : 0.08),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: accentColor.withValues(
                            alpha: isDark ? 0.1 : 0.14,
                          ),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: accentColor.withValues(
                              alpha: isDark ? 0.14 : 0.2,
                            ),
                          ),
                        ),
                        child: Icon(icon, color: accentColor, size: 24),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: theme.typography.h4.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              subtitle,
                              style: theme.typography.textSmall.copyWith(
                                color: theme.colorScheme.mutedForeground,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (trailing != null) ...[
                        const SizedBox(width: 12),
                        trailing!,
                      ],
                    ],
                  ),
                  if (stats.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: stats
                          .map((stat) => _TaskSurfaceStatChip(stat: stat))
                          .toList(growable: false),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TaskSurfaceSectionHeader extends StatelessWidget {
  const TaskSurfaceSectionHeader({
    required this.title,
    super.key,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 12),
          trailing!,
        ],
      ],
    );
  }
}

class TaskSurfaceMessageCard extends StatelessWidget {
  const TaskSurfaceMessageCard({
    required this.icon,
    required this.title,
    required this.description,
    super.key,
    this.accentColor,
    this.action,
  });

  final IconData icon;
  final String title;
  final String description;
  final Color? accentColor;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveAccent = accentColor ?? theme.colorScheme.primary;

    return TaskSurfacePane(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: effectiveAccent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, color: effectiveAccent, size: 28),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: theme.typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            description,
            textAlign: TextAlign.center,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              height: 1.4,
            ),
          ),
          if (action != null) ...[
            const SizedBox(height: 18),
            action!,
          ],
        ],
      ),
    );
  }
}

class _TaskSurfaceStatChip extends StatelessWidget {
  const _TaskSurfaceStatChip({required this.stat});

  final TaskSurfaceStatData stat;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final accent = stat.accentColor ?? theme.colorScheme.foreground;

    return Container(
      constraints: const BoxConstraints(minWidth: 104),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark
            ? Color.alphaBlend(
                accent.withValues(alpha: 0.08),
                theme.colorScheme.secondary,
              )
            : Colors.white.withValues(alpha: 0.56),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: accent.withValues(alpha: isDark ? 0.18 : 0.14),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            stat.value,
            style: theme.typography.large.copyWith(
              fontWeight: FontWeight.w800,
              color: accent,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            stat.label,
            style: theme.typography.xSmall.copyWith(
              color: isDark
                  ? theme.colorScheme.foreground.withValues(alpha: 0.72)
                  : theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
