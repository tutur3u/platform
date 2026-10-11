part of 'drive_page.dart';

class _DriveToolbar extends StatelessWidget {
  const _DriveToolbar({
    required this.path,
    required this.onGoUp,
    required this.selectedCount,
  });

  final String path;
  final VoidCallback? onGoUp;
  final int selectedCount;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const accent = Color(0xFF3FA36A);

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MetricChip(
                label: l10n.driveRootLabel,
                value: path.isEmpty ? l10n.driveRootLabel : path,
                icon: Icons.folder_outlined,
                tint: accent,
              ),
              if (selectedCount > 0)
                _MetricChip(
                  label: l10n.driveDeleteSelected(selectedCount),
                  value: '$selectedCount',
                  icon: Icons.check_circle_outline_rounded,
                  tint: accent,
                ),
              if (onGoUp != null)
                OutlinedButton.icon(
                  onPressed: onGoUp,
                  icon: const Icon(Icons.arrow_upward),
                  label: Text(l10n.driveGoUp),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DriveListTile extends StatelessWidget {
  const _DriveListTile({
    required this.entry,
    required this.selected,
    required this.onTap,
    required this.onLongPress,
    this.onRename,
    this.onDelete,
    this.onShare,
    this.onCopyPath,
    this.onOpenExternal,
    this.onExportLinks,
  });

  final DriveEntry entry;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final VoidCallback? onRename;
  final VoidCallback? onDelete;
  final VoidCallback? onShare;
  final VoidCallback? onCopyPath;
  final VoidCallback? onOpenExternal;
  final VoidCallback? onExportLinks;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    const accent = Color(0xFF3FA36A);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onLongPress: onLongPress,
        child: FinancePanel(
          onTap: onTap,
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  entry.isFolder
                      ? Icons.folder_outlined
                      : Icons.insert_drive_file_outlined,
                  color: accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      entry.isFolder
                          ? context.l10n.driveFolderLabel
                          : '${_formatBytes(entry.size)}'
                                ' • '
                                '${_formatDate(entry.updatedAt)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                children: [
                  Checkbox(
                    semanticLabel: entry.name,
                    value: selected,
                    onChanged: (_) => onLongPress(),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'rename') {
                        onRename?.call();
                      } else if (value == 'delete') {
                        onDelete?.call();
                      } else if (value == 'share') {
                        onShare?.call();
                      } else if (value == 'copy') {
                        onCopyPath?.call();
                      } else if (value == 'open') {
                        onOpenExternal?.call();
                      } else if (value == 'export') {
                        onExportLinks?.call();
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
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DriveMessageCard extends StatelessWidget {
  const _DriveMessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return FinanceEmptyState(
      icon: Icons.folder_copy_outlined,
      title: context.l10n.driveTitle,
      body: message,
    );
  }
}

class _DrivePreviewPage extends StatelessWidget {
  const _DrivePreviewPage({required this.title, required this.signedUrl});

  final String title;
  final String signedUrl;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: InAppWebView(initialUrlRequest: URLRequest(url: WebUri(signedUrl))),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.label,
    required this.value,
    this.icon,
    this.tint,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveTint = tint ?? theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: effectiveTint.withValues(alpha: 0.10),
        border: Border.all(color: effectiveTint.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: effectiveTint),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
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
          ),
        ],
      ),
    );
  }
}

String _formatBytes(int bytes) {
  if (bytes <= 0) return '0 B';
  const suffixes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = bytes.toDouble();
  var index = 0;
  while (value >= 1024 && index < suffixes.length - 1) {
    value /= 1024;
    index += 1;
  }
  return '${value.toStringAsFixed(index == 0 ? 0 : 1)} ${suffixes[index]}';
}

String _formatDate(String? value) {
  if (value == null) return '';
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return '';
  return DateFormat.yMMMd().add_Hm().format(parsed.toLocal());
}
