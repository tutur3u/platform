part of 'drive_page.dart';

class _DriveGrid extends StatelessWidget {
  const _DriveGrid({
    required this.entries,
    required this.workspaceId,
    required this.directoryPath,
    required this.selectedNames,
    required this.onTap,
    required this.onToggleSelection,
    this.onRename,
    this.onDelete,
    this.onShare,
    this.onCopyPath,
    this.onOpenExternal,
    this.onExportLinks,
  });

  final List<DriveEntry> entries;
  final String workspaceId;
  final String directoryPath;
  final Set<String> selectedNames;
  final ValueChanged<DriveEntry> onTap;
  final ValueChanged<DriveEntry> onToggleSelection;
  final ValueChanged<DriveEntry>? onRename;
  final ValueChanged<DriveEntry>? onDelete;
  final ValueChanged<DriveEntry>? onShare;
  final ValueChanged<DriveEntry>? onCopyPath;
  final ValueChanged<DriveEntry>? onOpenExternal;
  final ValueChanged<DriveEntry>? onExportLinks;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: entries.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 280,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.1,
      ),
      itemBuilder: (context, index) {
        final entry = entries[index];
        final selected = selectedNames.contains(entry.name);
        final theme = shad.Theme.of(context);
        const accent = Color(0xFF3FA36A);

        return PendingSyncFrame(
          workspaceId: workspaceId,
          feature: 'drive',
          entityId: directoryPath.isEmpty
              ? entry.name
              : '$directoryPath/${entry.name}',
          child: GestureDetector(
            onLongPress: () => onToggleSelection(entry),
            child: FinancePanel(
              onTap: () => onTap(entry),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: accent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          entry.isFolder
                              ? Icons.folder_outlined
                              : Icons.insert_drive_file_outlined,
                          color: accent,
                        ),
                      ),
                      const Spacer(),
                      Checkbox(
                        value: selected,
                        onChanged: (_) => onToggleSelection(entry),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Text(
                    entry.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    entry.isFolder
                        ? context.l10n.driveFolderLabel
                        : _formatBytes(entry.size),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.textSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: PopupMenuButton<String>(
                      onSelected: (value) {
                        if (value == 'rename') {
                          onRename?.call(entry);
                        } else if (value == 'delete') {
                          onDelete?.call(entry);
                        } else if (value == 'share') {
                          onShare?.call(entry);
                        } else if (value == 'copy') {
                          onCopyPath?.call(entry);
                        } else if (value == 'open') {
                          onOpenExternal?.call(entry);
                        } else if (value == 'export') {
                          onExportLinks?.call(entry);
                        }
                      },
                      itemBuilder: (context) => [
                        if (onRename != null)
                          PopupMenuItem(
                            value: 'rename',
                            child: Text(context.l10n.commonRename),
                          ),
                        if (onCopyPath != null)
                          PopupMenuItem(
                            value: 'copy',
                            child: Text(context.l10n.driveCopyPath),
                          ),
                        if (onShare != null)
                          PopupMenuItem(
                            value: 'share',
                            child: Text(context.l10n.commonShare),
                          ),
                        if (onOpenExternal != null)
                          PopupMenuItem(
                            value: 'open',
                            child: Text(context.l10n.commonOpen),
                          ),
                        if (onExportLinks != null)
                          PopupMenuItem(
                            value: 'export',
                            child: Text(context.l10n.driveExportLinksTitle),
                          ),
                        if (onDelete != null)
                          PopupMenuItem(
                            value: 'delete',
                            child: Text(context.l10n.commonDelete),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
