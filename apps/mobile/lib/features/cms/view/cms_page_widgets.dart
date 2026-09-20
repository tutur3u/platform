part of 'cms_page.dart';

class _CmsSegmentedControl extends StatelessWidget {
  const _CmsSegmentedControl({required this.section, required this.onChanged});

  final int section;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<int>(
      segments: [
        ButtonSegment(
          value: 0,
          icon: const Icon(Icons.dashboard_customize_outlined),
          label: Text(context.l10n.cmsOverview),
        ),
        ButtonSegment(
          value: 1,
          icon: const Icon(Icons.collections_bookmark_outlined),
          label: Text(context.l10n.cmsLibrary),
        ),
      ],
      selected: {section},
      onSelectionChanged: (value) => onChanged(value.first),
    );
  }
}

class _CmsMetricsGrid extends StatelessWidget {
  const _CmsMetricsGrid({required this.summary});

  final CmsSummary summary;

  @override
  Widget build(BuildContext context) {
    final counts = summary.counts;
    return LayoutBuilder(
      builder: (context, constraints) => GridView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: constraints.maxWidth >= 760
              ? 4
              : constraints.maxWidth < 360
              ? 1
              : 2,
          childAspectRatio: constraints.maxWidth < 360 ? 2.5 : 1.55,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        children: [
          _MetricTile(
            label: context.l10n.cmsCollections,
            value: counts.collections,
            icon: Icons.collections_bookmark_outlined,
          ),
          _MetricTile(
            label: context.l10n.cmsEntries,
            value: counts.entries,
            icon: Icons.article_outlined,
          ),
          _MetricTile(
            label: context.l10n.cmsStatusPublished,
            value: counts.published,
            icon: Icons.verified_outlined,
          ),
          _MetricTile(
            label: context.l10n.cmsStatusDraft,
            value: counts.drafts,
            icon: Icons.edit_note_outlined,
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final int value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, color: theme.colorScheme.primary),
          Text(
            '$value',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
          ),
          Text(
            label,
            style: TextStyle(color: theme.colorScheme.mutedForeground),
          ),
        ],
      ),
    );
  }
}

class _AttentionSection extends StatelessWidget {
  const _AttentionSection({
    required this.title,
    required this.items,
    required this.emptyText,
  });

  final String title;
  final List<CmsAttentionItem> items;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          if (items.isEmpty)
            Text(emptyText)
          else
            ...items
                .take(4)
                .map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _AttentionTile(item: item),
                  ),
                ),
        ],
      ),
    );
  }
}

class _AttentionTile extends StatelessWidget {
  const _AttentionTile({required this.item});

  final CmsAttentionItem item;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            item.detail,
            style: TextStyle(color: theme.colorScheme.mutedForeground),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Pill(label: item.collectionTitle),
              _Pill(label: item.status),
            ],
          ),
        ],
      ),
    );
  }
}

class _CollectionTile extends StatelessWidget {
  const _CollectionTile({
    required this.collection,
    required this.onEdit,
    required this.onDelete,
  });

  final CmsCollection collection;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(
            Icons.collections_bookmark_outlined,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  collection.title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${collection.slug} · ${collection.collectionType}',
                  style: TextStyle(color: theme.colorScheme.mutedForeground),
                ),
              ],
            ),
          ),
          IconButton(onPressed: onEdit, icon: const Icon(Icons.edit_outlined)),
          IconButton(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({
    required this.entry,
    required this.statusLabel,
    required this.onEdit,
    required this.onDelete,
    this.collectionTitle,
  });

  final CmsEntry entry;
  final String statusLabel;
  final String? collectionTitle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  entry.title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined),
              ),
              IconButton(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline_rounded),
              ),
            ],
          ),
          if (entry.summary != null) ...[
            const SizedBox(height: 6),
            Text(
              entry.summary!,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: theme.colorScheme.mutedForeground),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Pill(label: statusLabel),
              if (collectionTitle != null) _Pill(label: collectionTitle!),
              _Pill(label: entry.slug),
            ],
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: theme.colorScheme.primary.withValues(alpha: 0.28),
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: theme.colorScheme.primary,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CmsMessageCard extends StatelessWidget {
  const _CmsMessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: TextStyle(color: shad.Theme.of(context).colorScheme.foreground),
      ),
    );
  }
}
