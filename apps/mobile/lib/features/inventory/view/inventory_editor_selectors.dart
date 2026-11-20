part of 'inventory_product_editor_page.dart';

class _InventoryInlineAlertCard extends StatelessWidget {
  const _InventoryInlineAlertCard({
    required this.message,
    required this.color,
    required this.icon,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final Color color;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const AppGap(AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: AppTokens.of(context).typography.small.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const AppGap(AppSpacing.sm),
            AppButton.ghost(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

class _InventorySectionCard extends StatelessWidget {
  const _InventorySectionCard({
    required this.title,
    required this.child,
    this.action,
  });

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),

      fillColor: AppTokens.of(context).colorScheme.card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: AppTokens.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              if (action != null) ...[const AppGap(AppSpacing.md), action!],
            ],
          ),
          const AppGap(AppSpacing.sm),
          child,
        ],
      ),
    );
  }
}

class _InventorySelectorCard extends StatelessWidget {
  const _InventorySelectorCard({
    required this.label,
    required this.placeholder,
    required this.icon,
    this.title,
    this.errorText,
    this.onTap,
  });

  final String label;
  final String placeholder;
  final IconData icon;
  final String? title;
  final String? errorText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final palette = FinancePalette.of(context);
    final hasValue = title?.trim().isNotEmpty ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InventorySurface(
          label,
          icon: icon,
          errorText: errorText,
          onTap: onTap,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  hasValue ? title! : placeholder,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: hasValue ? FontWeight.w700 : FontWeight.w500,
                    color: hasValue
                        ? theme.colorScheme.foreground
                        : theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
              const AppGap(AppSpacing.sm),
              Icon(Icons.expand_more_rounded, size: 18, color: palette.accent),
            ],
          ),
        ),
      ],
    );
  }
}
