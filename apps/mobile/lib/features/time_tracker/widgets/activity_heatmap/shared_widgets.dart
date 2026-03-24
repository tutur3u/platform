part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Column(
      children: [
        Text(
          label,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
            fontSize: 11,
          ),
        ),
        const shad.Gap(2),
        Text(
          value,
          style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _MonthColumnLabel extends StatelessWidget {
  const _MonthColumnLabel({
    required this.text,
    required this.width,
    required this.height,
  });

  final String? text;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final fontSize = responsiveValue<double>(
      context,
      compact: 12,
      medium: 13,
      expanded: 14,
    );
    return SizedBox(
      width: width,
      height: height,
      child: text == null
          ? null
          : Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Text(
                    text!,
                    maxLines: 1,
                    textAlign: TextAlign.center,
                    style: theme.typography.small.copyWith(
                      fontSize: fontSize,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

class _DayLabel extends StatelessWidget {
  const _DayLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final double labelHeight = responsiveValue(
      context,
      compact: 14,
      medium: 16,
      expanded: 18,
    );
    return SizedBox(
      height: labelHeight,
      child: text.isNotEmpty
          ? Text(
              text,
              style: theme.typography.small.copyWith(
                fontSize: 9,
                color: theme.colorScheme.mutedForeground,
              ),
            )
          : null,
    );
  }
}

class _HeatCell extends StatelessWidget {
  const _HeatCell({
    required this.duration,
    required this.maxDuration,
    required this.size,
    this.useGreen = false,
  });

  final int duration;
  final int maxDuration;
  final double size;
  final bool useGreen;

  static const _kGreenLight = [
    Color(0xFF9BE9A8),
    Color(0xFF40C463),
    Color(0xFF30A14E),
    Color(0xFF216E39),
  ];

  static const _kGreenDark = [
    Color(0xFF0E4429),
    Color(0xFF006D32),
    Color(0xFF26A641),
    Color(0xFF39D353),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (duration <= 0) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(2),
          color: theme.colorScheme.muted,
        ),
      );
    }

    final intensity = (duration / maxDuration).clamp(0.0, 1.0);
    final Color cellColor;

    if (useGreen) {
      final greens = isDark ? _kGreenDark : _kGreenLight;
      final level = intensity < 0.25
          ? 0
          : intensity < 0.5
          ? 1
          : intensity < 0.75
          ? 2
          : 3;
      cellColor = greens[level];
    } else {
      cellColor = theme.colorScheme.primary.withValues(
        alpha: 0.2 + intensity * 0.8,
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(2),
        color: cellColor,
      ),
    );
  }
}

class _GridDay {
  const _GridDay({required this.date, required this.duration});
  final DateTime date;
  final int duration;
}
