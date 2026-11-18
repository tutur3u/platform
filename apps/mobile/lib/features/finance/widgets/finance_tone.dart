import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

enum FinanceTone {
  income,
  expense,
  transfer;

  ({Color fill, Color ink}) colors(BuildContext context) {
    final tone = switch (this) {
      income => AppTone.success,
      expense => AppTone.destructive,
      transfer => AppTone.info,
    };
    final colors = context.tokens.colorScheme;
    final fill = Color.alphaBlend(tone.fill(colors), colors.card);
    return (
      fill: fill,
      ink: AppearanceContrast.ensureContrast(
        tone.foreground(colors),
        against: fill,
        target: AppearanceContrast.aaText,
      ),
    );
  }
}

class FinanceToneIcon extends StatelessWidget {
  const FinanceToneIcon({required this.icon, required this.tone, super.key});

  final IconData icon;
  final FinanceTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = tone.colors(context);
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: colors.fill,
        borderRadius: context.tokens.borderRadiusMd,
      ),
      child: Icon(icon, size: 18, color: colors.ink),
    );
  }
}
