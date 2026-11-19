import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_tone.dart';
import 'package:mobile/l10n/l10n.dart';

/// Money in above and money out below a shared baseline, one slim bar pair
/// per bucket (a day, or a month in a year). While amounts are hidden only
/// flat stubs are drawn, so the chart never reveals relative sizes.
class FinancePeriodBars extends StatelessWidget {
  const FinancePeriodBars({
    required this.income,
    required this.expense,
    this.current,
    this.height = 64,
    super.key,
  }) : assert(income.length == expense.length, 'One value per bucket');

  final List<double> income;

  /// Money out per bucket, as positive amounts.
  final List<double> expense;

  /// Bucket drawn at full strength (today); the rest are softened.
  final int? current;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colorScheme;
    return Semantics(
      label: context.l10n.financePeriodChart,
      excludeSemantics: true,
      child: RepaintBoundary(
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: CustomPaint(
            painter: _PeriodBarsPainter(
              income: income,
              expense: expense,
              current: current,
              visible: financeAmountsVisible(context),
              incomeColor: FinanceTone.income.colors(context).ink,
              expenseColor: FinanceTone.expense.colors(context).ink,
              baseline: colors.border,
              stub: colors.muted,
              textDirection: Directionality.of(context),
            ),
          ),
        ),
      ),
    );
  }
}

class _PeriodBarsPainter extends CustomPainter {
  const _PeriodBarsPainter({
    required this.income,
    required this.expense,
    required this.current,
    required this.visible,
    required this.incomeColor,
    required this.expenseColor,
    required this.baseline,
    required this.stub,
    required this.textDirection,
  });

  final List<double> income;
  final List<double> expense;
  final int? current;
  final bool visible;
  final Color incomeColor;
  final Color expenseColor;
  final Color baseline;
  final Color stub;
  final TextDirection textDirection;

  @override
  void paint(Canvas canvas, Size size) {
    final count = income.length;
    if (count == 0) return;
    final mid = size.height / 2;
    canvas.drawLine(
      Offset(0, mid),
      Offset(size.width, mid),
      Paint()
        ..color = baseline
        ..strokeWidth = 1,
    );
    final slot = size.width / count;
    final barWidth = math.max(2, math.min(10, slot * 0.6)).toDouble();
    final peak = [...income, ...expense].fold<double>(0, math.max);
    final reach = mid - 2;
    for (var i = 0; i < count; i++) {
      final index = textDirection == TextDirection.rtl ? count - 1 - i : i;
      final x = slot * i + (slot - barWidth) / 2;
      final soft = current != null && index > current!;
      if (!visible || peak <= 0) {
        _bar(canvas, x, mid - 1, barWidth, 2, stub);
        continue;
      }
      final up = income[index] / peak * reach;
      final down = expense[index] / peak * reach;
      if (up > 0) {
        _bar(
          canvas,
          x,
          mid - math.max(up, 2) - 1,
          barWidth,
          math.max(up, 2),
          incomeColor.withValues(alpha: soft ? 0.35 : 1),
        );
      }
      if (down > 0) {
        _bar(
          canvas,
          x,
          mid + 1,
          barWidth,
          math.max(down, 2),
          expenseColor.withValues(alpha: soft ? 0.35 : 1),
        );
      }
    }
  }

  void _bar(Canvas canvas, double x, double y, double w, double h, Color c) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, w, h),
        Radius.circular(math.min(w / 2, 3)),
      ),
      Paint()..color = c,
    );
  }

  @override
  bool shouldRepaint(_PeriodBarsPainter old) =>
      !identical(old.income, income) ||
      !identical(old.expense, expense) ||
      old.current != current ||
      old.visible != visible ||
      old.incomeColor != incomeColor ||
      old.expenseColor != expenseColor ||
      old.baseline != baseline ||
      old.stub != stub ||
      old.textDirection != textDirection;
}
