import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/kit/app_panel.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One figure in an [AppStatStrip].
@immutable
class AppStatStripItem {
  const AppStatStripItem({
    required this.label,
    required this.value,
    this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback? onTap;
}

/// A compact band of counts. Use this when several figures share one glance
/// and none of them is the page's hero. Larger single figures stay on
/// AppStatTile.
class AppStatStrip extends StatelessWidget {
  const AppStatStrip({required this.items, super.key});

  final List<AppStatStripItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final colors = AppTokens.of(context).colorScheme;
    return AppPanel(
      padded: false,
      child: Row(
        children: [
          for (var index = 0; index < items.length; index++) ...[
            if (index > 0)
              SizedBox(
                height: AppSpacing.xl,
                child: VerticalDivider(width: 1, color: colors.border),
              ),
            Expanded(child: _StatCell(item: items[index])),
          ],
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.item});

  final AppStatStripItem item;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final type = tokens.typography;
    return Semantics(
      button: item.onTap != null,
      label: '${item.label} ${item.value}',
      child: InkWell(
        onTap: item.onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppLayout.rowMinHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  item.value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.base.copyWith(
                    color: colors.foreground,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: type.xSmall.copyWith(
                    color: colors.mutedForeground,
                    fontWeight: FontWeight.w500,
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
