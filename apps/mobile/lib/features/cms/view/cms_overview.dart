part of 'cms_page.dart';

extension _CmsOverview on _CmsPageState {
  List<Widget> _overviewChildren(BuildContext context) {
    final status = _statusBlock(context);
    final summary = _summary;
    if (status != null) return [status];
    if (summary == null) {
      return [
        AppStateMessage(
          icon: LucideIcons.newspaper,
          title: context.l10n.cmsNoAccess,
        ),
      ];
    }
    final l10n = context.l10n;
    final counts = summary.counts;
    return [
      ?_refreshNotice(context),
      AppSummaryHero(
        icon: LucideIcons.newspaper,
        tone: AppTone.info,
        eyebrow: l10n.cmsPipelineEyebrow,
        headline: l10n.cmsPublishedOfTotal(counts.published, counts.entries),
        supporting: l10n.cmsPipelineSupporting(counts.drafts, counts.scheduled),
        facts: [
          AppHeroFact(
            label: l10n.cmsCollections,
            value: '${counts.collections}',
          ),
          AppHeroFact(label: l10n.cmsEntries, value: '${counts.entries}'),
          AppHeroFact(
            label: l10n.cmsStatusArchived,
            value: '${counts.archived}',
          ),
        ],
        actions: [
          if (_collections.isNotEmpty)
            AppButton.primary(
              onPressed: _showEntryEditor,
              leading: const Icon(LucideIcons.plus, size: 16),
              child: Text(l10n.cmsNewEntry),
            ),
          AppButton.outline(
            onPressed: _showCollectionEditor,
            leading: const Icon(LucideIcons.folderPlus, size: 16),
            child: Text(l10n.cmsNewCollection),
          ),
        ],
      ),
      const SizedBox(height: AppLayout.sectionGap),
      AppAdaptiveGrid(
        minTileWidth: 300,
        maxColumns: 3,
        spacing: AppSpacing.lg,
        runSpacing: AppLayout.sectionGap,
        children: [
          _CmsQueue(
            title: l10n.cmsNeedsAttention,
            icon: LucideIcons.imageOff,
            tone: AppTone.warning,
            items: summary.draftsMissingMedia,
            onOpen: _openAttentionItem,
          ),
          _CmsQueue(
            title: l10n.cmsScheduledSoon,
            icon: LucideIcons.calendarClock,
            tone: AppTone.info,
            items: summary.scheduledSoon,
            onOpen: _openAttentionItem,
          ),
          _CmsQueue(
            title: l10n.cmsArchivedBacklog,
            icon: LucideIcons.archive,
            tone: AppTone.neutral,
            items: summary.archivedBacklog,
            onOpen: _openAttentionItem,
          ),
        ],
      ),
      if (summary.collections.isNotEmpty) ...[
        const SizedBox(height: AppLayout.sectionGap),
        AppPanel(
          title: l10n.cmsCollectionsProgress,
          child: AppAdaptiveGrid(
            minTileWidth: 260,
            maxColumns: 3,
            spacing: AppSpacing.xxl,
            runSpacing: AppSpacing.lg,
            children: [
              for (final row in summary.collections.take(6))
                _CollectionProgress(collection: row),
            ],
          ),
        ),
      ],
    ];
  }

  /// Opens the editor for an attention item when its entry is loaded.
  VoidCallback? _openAttentionItem(CmsAttentionItem item) {
    final entry = _entries.where((row) => row.id == item.entryId).firstOrNull;
    if (entry == null || _denied) return null;
    return () => _showEntryEditor(entry);
  }
}

class _CmsQueue extends StatelessWidget {
  const _CmsQueue({
    required this.title,
    required this.icon,
    required this.tone,
    required this.items,
    required this.onOpen,
  });

  final String title;
  final IconData icon;
  final AppTone tone;
  final List<CmsAttentionItem> items;
  final VoidCallback? Function(CmsAttentionItem item) onOpen;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    mainAxisSize: MainAxisSize.min,
    children: [
      AppSectionHeader(title: title),
      AppGroupedCard(
        dividerInset: _CmsStatus.rowDividerInset,
        children: items.isEmpty
            ? [
                AppStateMessage.inline(
                  icon: LucideIcons.circleCheck,
                  tone: AppTone.success,
                  title: context.l10n.cmsQueueEmpty,
                ),
              ]
            : [
                for (final item in items.take(4))
                  _AttentionRow(
                    item: item,
                    icon: icon,
                    tone: tone,
                    onTap: onOpen(item),
                  ),
              ],
      ),
    ],
  );
}
