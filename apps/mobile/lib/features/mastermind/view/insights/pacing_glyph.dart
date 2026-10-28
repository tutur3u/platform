import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/l10n/l10n.dart';

/// A pool's pacing verdict as a shape and a word, never a colour alone:
/// "Running short" (a falling triangle), "On pace" (a dot), "Surplus" (a
/// rising triangle) or "No pacing data" (a hollow square, static so it is not
/// read as a spinner). It is the chart's reserve check, not a routing
/// recommendation.
class PacingGlyph extends StatelessWidget {
  const PacingGlyph({required this.pacing, this.missingReason, super.key});

  final Pacing? pacing;
  final String? missingReason;

  static String word(AppLocalizations l10n, Pacing? pacing) => switch (pacing) {
    Pacing.short => l10n.mastermindUsageVerdictShort,
    Pacing.ok => l10n.mastermindUsageVerdictOk,
    Pacing.surplus => l10n.mastermindUsageVerdictSurplus,
    null => l10n.mastermindUsageVerdictNone,
  };

  @override
  Widget build(BuildContext context) {
    final label = word(context.l10n, pacing);
    return switch (pacing) {
      Pacing.short => StatusGlyph(status: ChartStatus.short, label: label),
      Pacing.ok => StatusGlyph(status: ChartStatus.ok, label: label),
      Pacing.surplus => StatusGlyph(status: ChartStatus.surplus, label: label),
      null => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NoPacingGlyph(label: label),
          if (missingReason != null) Text(missingReason!),
        ],
      ),
    };
  }
}

class _NoPacingGlyph extends StatelessWidget {
  const _NoPacingGlyph({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = AppChartPalette.of(context);
    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CustomPaint(
              size: const Size(20, 20),
              painter: _HollowSquarePainter(
                palette.tone(AppTone.neutral),
                palette.surface,
              ),
            ),
            const SizedBox(width: AppSpacing.xs + 2),
            Flexible(
              child: Text(label, style: TextStyle(color: palette.text)),
            ),
          ],
        ),
      ),
    );
  }
}

class _HollowSquarePainter extends CustomPainter {
  const _HollowSquarePainter(this.color, this.surface);

  final Color color;
  final Color surface;

  @override
  void paint(Canvas canvas, Size size) => chartMarker(
    canvas,
    size.center(Offset.zero),
    ChartMarker.square,
    color,
    size: 10,
    hollow: true,
    surface: surface,
  );

  @override
  bool shouldRepaint(_HollowSquarePainter old) =>
      color != old.color || surface != old.surface;
}
