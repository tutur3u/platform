part of 'drive_page.dart';

class _DriveGrid extends StatelessWidget {
  const _DriveGrid({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => AppAdaptiveGrid(
    minTileWidth: 132,
    maxColumns: 5,
    equalHeight: true,
    children: children,
  );
}

class _DriveEntryTile extends StatelessWidget {
  const _DriveEntryTile({
    required this.entry,
    required this.grid,
    required this.selected,
    required this.selecting,
    required this.onTap,
    required this.onLongPress,
    required this.onMenu,
  });

  final DriveEntry entry;
  final bool grid;
  final bool selected;
  final bool selecting;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final symbol = AppIconTile(
      icon: entry.isFolder ? LucideIcons.folder : LucideIcons.file,
      tone: entry.isFolder ? AppTone.info : AppTone.neutral,
    );
    final action = selecting
        ? AppCheckbox(
            value: selected,
            onChanged: (_) => onTap(),
            semanticLabel: entry.name,
          )
        : AppIconButton(
            tooltip: l10n.commonMoreOptions,
            icon: const Icon(LucideIcons.ellipsis),
            onPressed: onMenu,
          );
    final title = Text(
      entry.name,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
    final updated = _formatDate(entry.updatedAt);
    final metadata = entry.isFolder
        ? null
        : [
            _formatBytes(entry.size),
            if (!grid && updated.isNotEmpty) updated,
          ].join(' · ');
    if (!grid) {
      return GestureDetector(
        onLongPress: onLongPress,
        child: AppGroupedRow(
          title: title,
          subtitle: metadata == null ? null : Text(metadata),
          leading: symbol,
          trailing: action,
          onTap: onTap,
        ),
      );
    }

    return AppCard(
      borderColor: tokens.colorScheme.border,
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [symbol, const Spacer(), action]),
              const SizedBox(height: AppSpacing.xs),
              DefaultTextStyle.merge(
                style: tokens.typography.base.copyWith(
                  fontWeight: FontWeight.w600,
                ),
                child: title,
              ),
              if (metadata != null) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  metadata,
                  style: tokens.typography.small.copyWith(
                    color: tokens.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DriveUsage extends StatelessWidget {
  const _DriveUsage({required this.usage});

  final DriveAnalytics usage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final percentage = usage.usagePercentage.clamp(0.0, 100.0) / 100;
    return AppGroupedCard(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(
            icon: LucideIcons.hardDrive,
            tone: AppTone.info,
          ),
          title: Text(l10n.driveUsedLabel),
          trailing: Text(_formatBytes(usage.totalSize)),
        ),
        if (usage.storageLimit > 0) ...[
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppLayout.rowHorizontalPadding,
            ),
            child: LinearProgressIndicator(value: percentage),
          ),
          AppGroupedRow(
            title: Text(l10n.driveLimitLabel),
            trailing: Text(_formatBytes(usage.storageLimit)),
          ),
        ],
        AppGroupedRow(
          title: Text(l10n.driveFilesLabel),
          trailing: Text(
            NumberFormat.decimalPattern(
              l10n.localeName,
            ).format(usage.fileCount),
          ),
        ),
      ],
    );
  }
}
