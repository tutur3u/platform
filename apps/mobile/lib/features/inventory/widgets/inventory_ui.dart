import 'package:flutter/material.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
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
        ? shad.Alert.destructive(
            title: Text(message),
          )
        : shad.Alert(
            title: Text(message),
          ),
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
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? headerAction;
  final List<Widget> metrics;
  final List<Widget> actions;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: palette.subtleBorder),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette.heroGradient,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: theme.brightness == Brightness.dark ? 0.22 : 0.06,
            ),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: palette.accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(
                  icon,
                  size: 26,
                  color: palette.accent,
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
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
          ),
          if (metrics.isNotEmpty) ...[
            const shad.Gap(18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: metrics,
            ),
          ],
          if (child != null) ...[
            const shad.Gap(18),
            child!,
          ],
          if (actions.isNotEmpty) ...[
            const shad.Gap(18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: actions,
            ),
          ],
        ],
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
    return FinanceStatChip(
      label: label,
      value: value,
      icon: icon,
      tint: tint,
    );
  }
}
