part of 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    return Column(
      children: [
        Text(
          label,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
            fontSize: 11,
          ),
        ),
        const AppGap(AppSpacing.xxs),
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
    final theme = AppTokens.of(context);
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
    final theme = AppTokens.of(context);
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
  });

  final int duration;
  final int maxDuration;
  final double size;

  @override
  Widget build(BuildContext context) {
    final cellColor = _activityCellColor(context, duration, maxDuration);

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
