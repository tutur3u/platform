part of 'cms_page.dart';

Widget _buildCmsOverview(_CmsPageState state, BuildContext context) {
  final summary = state._summary;
  if (summary == null) {
    return _CmsMessageCard(message: context.l10n.cmsNoAccess);
  }

  return Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _CmsMetricsGrid(summary: summary),
      const SizedBox(height: 16),
      _AttentionSection(
        title: context.l10n.cmsNeedsAttention,
        items: summary.draftsMissingMedia,
        emptyText: context.l10n.cmsQueueEmpty,
      ),
      const SizedBox(height: 12),
      _AttentionSection(
        title: context.l10n.cmsScheduledSoon,
        items: summary.scheduledSoon,
        emptyText: context.l10n.cmsQueueEmpty,
      ),
      const SizedBox(height: 12),
      _AttentionSection(
        title: context.l10n.cmsArchivedBacklog,
        items: summary.archivedBacklog,
        emptyText: context.l10n.cmsQueueEmpty,
      ),
    ],
  );
}
