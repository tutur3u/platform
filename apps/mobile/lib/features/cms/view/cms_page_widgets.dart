part of 'cms_page.dart';

/// Visual treatment of an entry status: one tone and icon per stage of the
/// draft → scheduled → published → archived pipeline.
abstract final class _CmsStatus {
  static const statuses = ['draft', 'scheduled', 'published', 'archived'];
  static const double leadingSize = 40;
  static const double rowDividerInset =
      AppLayout.rowHorizontalPadding + leadingSize + AppLayout.rowLeadingGap;

  static AppTone tone(String status) => switch (status) {
    'published' => AppTone.success,
    'scheduled' => AppTone.info,
    'archived' => AppTone.neutral,
    _ => AppTone.warning,
  };

  static IconData icon(String status) => switch (status) {
    'published' => LucideIcons.circleCheck,
    'scheduled' => LucideIcons.calendarClock,
    'archived' => LucideIcons.archive,
    _ => LucideIcons.pencilLine,
  };

  static String label(BuildContext context, String status) => switch (status) {
    'published' => context.l10n.cmsStatusPublished,
    'scheduled' => context.l10n.cmsStatusScheduled,
    'archived' => context.l10n.cmsStatusArchived,
    _ => context.l10n.cmsStatusDraft,
  };

  static String? when(BuildContext context, String? iso) {
    final parsed = iso == null ? null : DateTime.tryParse(iso);
    if (parsed == null) return null;
    final locale = Localizations.localeOf(context).toLanguageTag();
    return DateFormat.MMMd(locale).add_Hm().format(parsed.toLocal());
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final c = tokens.colorScheme;
    final tone = _CmsStatus.tone(status);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.fill(c),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xxs,
        ),
        child: Text(
          _CmsStatus.label(context, status),
          style: tokens.typography.label.copyWith(
            color: tone == AppTone.neutral ? c.foreground : tone.foreground(c),
          ),
        ),
      ),
    );
  }
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({
    required this.item,
    required this.icon,
    required this.tone,
    this.onTap,
  });

  final CmsAttentionItem item;
  final IconData icon;
  final AppTone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final when = _CmsStatus.when(context, item.scheduledFor);
    return AppRichRow(
      leading: AppIconTile(
        icon: icon,
        tone: tone,
        size: _CmsStatus.leadingSize,
      ),
      title: item.title,
      subtitle: item.detail,
      meta: [
        AppMetaItem(icon: LucideIcons.folder, label: item.collectionTitle),
        if (when != null) AppMetaItem(icon: LucideIcons.clock, label: when),
      ],
      trailing: _StatusBadge(status: item.status),
      onTap: onTap,
    );
  }
}

class _CollectionRow extends StatelessWidget {
  const _CollectionRow({
    required this.collection,
    required this.onTap,
    this.entryCount,
  });

  final CmsCollection collection;
  final int? entryCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final count = entryCount;
    return AppRichRow(
      leading: AppIconTile(
        icon: LucideIcons.libraryBig,
        tone: collection.isEnabled ? AppTone.info : AppTone.neutral,
        size: _CmsStatus.leadingSize,
      ),
      title: collection.title,
      subtitle: collection.description,
      meta: [
        AppMetaItem(icon: LucideIcons.link, label: collection.slug),
        AppMetaItem(icon: LucideIcons.tag, label: collection.collectionType),
        if (count != null)
          AppMetaItem(
            icon: LucideIcons.fileText,
            label: l10n.cmsEntryCount(count),
          ),
      ],
      trailing: collection.isEnabled
          ? null
          : AppBadge.outline(child: Text(l10n.cmsCollectionDisabled)),
      onTap: onTap,
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({
    required this.entry,
    required this.onTap,
    this.collectionTitle,
  });

  final CmsEntry entry;
  final String? collectionTitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final when = _CmsStatus.when(
      context,
      entry.status == 'scheduled' ? entry.scheduledFor : null,
    );
    return AppRichRow(
      leading: AppIconTile(
        icon: _CmsStatus.icon(entry.status),
        tone: _CmsStatus.tone(entry.status),
        size: _CmsStatus.leadingSize,
      ),
      title: entry.title,
      subtitle: entry.summary,
      meta: [
        if (collectionTitle case final title?)
          AppMetaItem(icon: LucideIcons.folder, label: title),
        if (when != null)
          AppMetaItem(icon: LucideIcons.clock, label: when)
        else
          AppMetaItem(icon: LucideIcons.link, label: entry.slug),
      ],
      trailing: _StatusBadge(status: entry.status),
      onTap: onTap,
    );
  }
}

class _CollectionProgress extends StatelessWidget {
  const _CollectionProgress({required this.collection});

  final CmsSummaryCollection collection;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final c = tokens.colorScheme;
    final total = collection.totalEntries;
    final published = collection.publishedEntries;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                collection.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.small.copyWith(
                  color: c.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              context.l10n.cmsPublishedOfTotal(published, total),
              style: tokens.typography.xSmall.copyWith(
                color: c.mutedForeground,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs + 2),
        AppMeter(
          value: total == 0 ? 0 : published / total,
          tone: collection.isEnabled ? AppTone.success : AppTone.neutral,
          semanticLabel: context.l10n.cmsPublishedOfTotal(published, total),
        ),
      ],
    );
  }
}
