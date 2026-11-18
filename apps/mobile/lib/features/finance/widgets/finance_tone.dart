import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

enum FinanceTone {
  income,
  expense,
  transfer;

  ({Color fill, Color ink}) colors(BuildContext context) {
    final hues = SorbetTokens.maybeOf(context)?.hues;
    final (hue, fallback) = switch (this) {
      income => (hues?.green, AppTone.success),
      expense => (hues?.orange, AppTone.warning),
      transfer => (hues?.blue, AppTone.info),
    };
    final colors = context.tokens.colorScheme;
    return (
      fill: hue?.fill ?? Color.alphaBlend(fallback.fill(colors), colors.card),
      ink: hue?.ink ?? colors.foreground,
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
