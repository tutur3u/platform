import 'package:flutter/material.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void showInventoryToast(
  BuildContext context,
  String message, {
  bool destructive = false,
}) {
  final toastContext = Navigator.of(context, rootNavigator: true).context;
  if (!toastContext.mounted) {
    return;
  }

  shad.showToast(
    context: toastContext,
    builder: (context, overlay) => destructive
        ? shad.Alert.destructive(title: Text(message))
        : shad.Alert(title: Text(message)),
  );
}

class InventoryHeroCard extends StatelessWidget {
  const InventoryHeroCard({
    required this.title,
    required this.icon,
    this.subtitle,
    this.headerAction,
    this.metrics = const [],
    this.actions = const [],
    this.child,
    this.showHeader = true,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? headerAction;
  final List<Widget> metrics;
  final List<Widget> actions;
  final Widget? child;
  final bool showHeader;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.subtleBorder.withValues(alpha: 0.8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showHeader)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: palette.accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, size: 22, color: palette.accent),
                ),
                const shad.Gap(14),
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
                if (headerAction != null) ...[
                  const shad.Gap(12),
                  headerAction!,
                ],
              ],
            )
          else if (subtitle?.trim().isNotEmpty ?? false)
            Text(
              subtitle!,
              style: theme.typography.p.copyWith(
                color: theme.colorScheme.mutedForeground,
                height: 1.45,
              ),
            ),
          if (metrics.isNotEmpty) ...[
            if (showHeader || (subtitle?.trim().isNotEmpty ?? false))
              const shad.Gap(18),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: metrics,
            ),
          ],
          if (child != null) ...[const shad.Gap(18), child!],
          if (actions.isNotEmpty) ...[
            const shad.Gap(16),
            Wrap(spacing: 10, runSpacing: 10, children: actions),
          ],
        ],
      ),
    );
  }
}

class InventoryActionTile extends StatelessWidget {
  const InventoryActionTile({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.primary = false,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final foreground = primary
        ? theme.colorScheme.primaryForeground
        : theme.colorScheme.foreground;
    final background = primary
        ? theme.colorScheme.primary
        : theme.colorScheme.muted.withValues(alpha: 0.36);

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48, maxWidth: 150),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(14),
              border: primary ? null : Border.all(color: palette.subtleBorder),
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: foreground),
                const shad.Gap(8),
                Expanded(
                  child: Text(
                    label,
                    style: theme.typography.small.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class InventoryMetricTile extends StatelessWidget {
  const InventoryMetricTile({
    required this.label,
    required this.value,
    required this.icon,
    this.tint,
    super.key,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 18,
              color: tint ?? FinancePalette.of(context).accent,
            ),
            const shad.Gap(8),
            Expanded(child: Text(label, style: theme.typography.textSmall)),
            const shad.Gap(12),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.6),
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: theme.typography.textSmall.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A calm, compact empty state; its section already supplies the heading.
class InventoryEmptyPanel extends StatelessWidget {
  const InventoryEmptyPanel({
    required this.body,
    this.icon,
    this.action,
    super.key,
  });

  final String body;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icon ?? Icons.inventory_2_outlined,
                color: FinancePalette.of(context).accent,
                size: 22,
              ),
              const shad.Gap(12),
              Expanded(child: Text(body, style: theme.typography.textSmall)),
            ],
          ),
          if (action != null) ...[const shad.Gap(12), action!],
        ],
      ),
    );
  }
}

/// Null stock is unlimited; it is never treated as a zero quantity.
String inventoryStockAmount(BuildContext context, double? amount) =>
    amount == null
    ? context.l10n.inventoryStockUnlimited
    : amount.toStringAsFixed(amount % 1 == 0 ? 0 : 1);

class InventoryOverviewSkeleton extends StatelessWidget {
  const InventoryOverviewSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: EdgeInsets.fromLTRB(
      16,
      8,
      16,
      32 + MediaQuery.paddingOf(context).bottom,
    ),
    children: const [
      FinanceSkeletonBlock(height: 210, radius: 20),
      shad.Gap(24),
      FinanceSkeletonBlock(height: 22, width: 180, radius: 8),
      shad.Gap(12),
      FinanceSkeletonBlock(height: 92, radius: 22),
      shad.Gap(12),
      FinanceSkeletonBlock(height: 92, radius: 22),
      shad.Gap(24),
      FinanceSkeletonBlock(height: 22, width: 160, radius: 8),
      shad.Gap(12),
      FinanceSkeletonBlock(height: 132, radius: 22),
    ],
  );
}
