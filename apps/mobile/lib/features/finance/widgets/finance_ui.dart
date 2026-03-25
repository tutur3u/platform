import 'package:flutter/material.dart' hide Card;
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class FinancePalette {
  factory FinancePalette.of(BuildContext context) {
    return FinancePalette._(shad.Theme.of(context));
  }

  FinancePalette._(this.theme);

  final shad.ThemeData theme;

  Color get positive => theme.brightness == Brightness.dark
      ? const Color(0xFF6FE3A2)
      : const Color(0xFF157347);

  Color get negative => theme.brightness == Brightness.dark
      ? const Color(0xFFFF6B7C)
      : theme.colorScheme.destructive;

  Color get accent => theme.brightness == Brightness.dark
      ? const Color(0xFF7BC4FF)
      : const Color(0xFF0F5FB7);

  Color get panel => Color.alphaBlend(
    theme.colorScheme.card.withValues(
      alpha: theme.brightness == Brightness.dark ? 0.92 : 0.98,
    ),
    theme.colorScheme.background,
  );

  Color get elevatedPanel => Color.alphaBlend(
    theme.colorScheme.muted.withValues(
      alpha: theme.brightness == Brightness.dark ? 0.28 : 0.5,
    ),
    panel,
  );

  Color get subtleBorder => theme.colorScheme.border.withValues(alpha: 0.55);

  List<Color> get heroGradient => [
    accent.withValues(alpha: theme.brightness == Brightness.dark ? 0.30 : 0.18),
    panel,
    elevatedPanel,
  ];
}

class FinancePanel extends StatelessWidget {
  const FinancePanel({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.borderColor,
    this.backgroundColor,
    this.onTap,
    this.radius = 24,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final Color? backgroundColor;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final body = Container(
      decoration: BoxDecoration(
        color: backgroundColor ?? palette.panel,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: borderColor ?? palette.subtleBorder,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: shad.Theme.of(context).brightness == Brightness.dark
                  ? 0.18
                  : 0.05,
            ),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: padding,
        child: child,
      ),
    );

    if (onTap == null) {
      return body;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(radius),
        onTap: onTap,
        child: body,
      ),
    );
  }
}

class FinanceSectionHeader extends StatelessWidget {
  const FinanceSectionHeader({
    required this.title,
    this.subtitle,
    this.action,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? action;

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
              if (subtitle?.trim().isNotEmpty ?? false) ...[
                const shad.Gap(4),
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
        if (action != null) ...[
          const shad.Gap(12),
          action!,
        ],
      ],
    );
  }
}

class FinanceStatChip extends StatelessWidget {
  const FinanceStatChip({
    required this.label,
    required this.value,
    this.icon,
    this.tint,
    super.key,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = tint ?? FinancePalette.of(context).accent;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: color),
            const shad.Gap(8),
          ],
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.foreground,
                ),
              ),
              Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class FinanceAmountText extends StatelessWidget {
  const FinanceAmountText({
    required this.amount,
    required this.currency,
    this.style,
    this.showPlus = true,
    this.forceColor,
    this.alignment = CrossAxisAlignment.end,
    super.key,
  });

  final double amount;
  final String currency;
  final TextStyle? style;
  final bool showPlus;
  final Color? forceColor;
  final CrossAxisAlignment alignment;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final isNegative = amount < 0;
    final prefix = !isNegative && showPlus ? '+' : '';
    final color =
        forceColor ?? (isNegative ? palette.negative : palette.positive);

    return Column(
      crossAxisAlignment: alignment,
      children: [
        Text(
          '$prefix${formatCurrency(amount, currency)}',
          style: (style ?? theme.typography.large).copyWith(
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
        Text(
          currency.toUpperCase(),
          style: theme.typography.xSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
            letterSpacing: 0.4,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class FinanceEmptyState extends StatelessWidget {
  const FinanceEmptyState({
    required this.icon,
    required this.title,
    required this.body,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);

    return FinancePanel(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: palette.accent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(icon, size: 28, color: palette.accent),
          ),
          const shad.Gap(14),
          Text(
            title,
            style: theme.typography.large.copyWith(
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
          const shad.Gap(6),
          Text(
            body,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          if (action != null) ...[
            const shad.Gap(16),
            action!,
          ],
        ],
      ),
    );
  }
}

class FinanceKeyValueRow extends StatelessWidget {
  const FinanceKeyValueRow({
    required this.label,
    required this.value,
    this.trailing,
    super.key,
  });

  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
        const shad.Gap(12),
        Flexible(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (trailing != null) ...[
                const shad.Gap(8),
                trailing!,
              ],
            ],
          ),
        ),
      ],
    );
  }
}
