import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/transaction.dart';

/// Hues a category falls back to when it has no colour of its own.
const _categoryHues = [
  'orange',
  'pink',
  'blue',
  'purple',
  'teal',
  'yellow',
  'red',
];

/// The theme hue named [tone] (Sorbet hues, or the default Sorbet palette
/// under the classic design), shared with calendar event blocks.
SorbetHue financeHue(BuildContext context, String tone) =>
    AppEventBlock.hueOf(context, tone);

/// Nearest hue name for a `#rrggbb` colour, or null when it has none.
String? hueNameForHex(String? value) {
  if (value == null || !value.startsWith('#') || value.length != 7) {
    return null;
  }
  final rgb = int.tryParse(value.substring(1), radix: 16);
  if (rgb == null) return null;
  final hsv = HSVColor.fromColor(Color(0xFF000000 | rgb));
  if (hsv.saturation < .12) return 'gray';
  final h = hsv.hue;
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/// Stable hue for a category: its own colour when set, otherwise one picked
/// from its name so the same category keeps the same tile everywhere.
String financeCategoryHueName({String? color, String? name}) {
  final fromColor = hueNameForHex(color);
  if (fromColor != null) return fromColor;
  final key = (name ?? '').trim().toLowerCase();
  if (key.isEmpty) return 'gray';
  var hash = 0;
  for (final unit in key.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return _categoryHues[hash % _categoryHues.length];
}

/// Hue for a transaction row: blue for transfers, green for income without
/// a coloured category, otherwise the category hue.
String financeTransactionHueName(Transaction transaction) {
  if (transaction.isTransfer) return 'blue';
  final fromColor = hueNameForHex(transaction.categoryColor);
  if (fromColor != null) return fromColor;
  if ((transaction.amount ?? 0) > 0) return 'green';
  return financeCategoryHueName(name: transaction.categoryName);
}

/// 36 dp rounded tile with an icon in a hue's ink on its fill.
class FinanceHueTile extends StatelessWidget {
  const FinanceHueTile({
    required this.icon,
    required this.hue,
    this.size = 36,
    super.key,
  });

  final IconData icon;
  final String hue;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = financeHue(context, hue);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colors.fill,
          borderRadius: context.tokens.borderRadiusMd,
        ),
        child: Icon(icon, size: size / 2, color: colors.ink),
      ),
    );
  }
}
