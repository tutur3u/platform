import 'package:flutter/material.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Pacing as a shape and a word, never a colour alone. Unknown is a dashed
/// outline. It is the chart's reserve check, not a routing recommendation.
class PacingGlyph extends StatelessWidget {
  const PacingGlyph({required this.pacing, this.missingReason, super.key});

  final Pacing? pacing;
  final String? missingReason;

  @override
  Widget build(BuildContext context) => StatusGlyph(
    status: switch (pacing) {
      Pacing.short => ChartStatus.short,
      Pacing.ok => ChartStatus.ok,
      Pacing.surplus => ChartStatus.surplus,
      null => ChartStatus.unknown,
    },
    label: pacing == null
        ? missingReason ?? context.l10n.mastermindStateUnknown
        : MastermindLabels.pacing(pacing!),
  );
}
