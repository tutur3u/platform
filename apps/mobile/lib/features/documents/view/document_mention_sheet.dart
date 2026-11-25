import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/l10n/l10n.dart';

/// The picker row that asks for a custom date, returned as itself.
const DocumentMentionOption documentCustomDateOption = DocumentMentionOption(
  id: 'custom-date',
  label: '',
  type: DocumentMentionType.date,
);

/// Picks something to mention, as the web's `@` menu does: people, the
/// workspace, projects, tasks and dates, filtered by the search. Pops the
/// chosen option, or [documentCustomDateOption] to pick a date.
class DocumentMentionSheet extends StatefulWidget {
  const DocumentMentionSheet({required this.options, super.key});

  /// The workspace's mentionable entities; dates are added here.
  final Future<List<DocumentMentionOption>> options;

  @override
  State<DocumentMentionSheet> createState() => _DocumentMentionSheetState();
}

class _DocumentMentionSheetState extends State<DocumentMentionSheet> {
  final TextEditingController _search = TextEditingController();
  late final List<DocumentMentionOption> _dates = documentDateMentionOptions(
    DateTime.now(),
  );
  List<DocumentMentionOption>? _loaded;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(
      widget.options.then(
        (options) {
          if (mounted) setState(() => _loaded = options);
        },
        onError: (Object _) {
          if (mounted) setState(() => _failed = true);
        },
      ),
    );
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = _search.text;
    final options = filterDocumentMentions([...?_loaded, ..._dates], query);
    final groups = [
      for (final type in DocumentMentionType.values)
        (
          type,
          [
            for (final option in options)
              if (option.type == type) option,
          ],
        ),
    ];
    final loading = _loaded == null && !_failed;
    return AppSheetScaffold(
      title: l10n.documentsInsertMention,
      icon: LucideIcons.atSign,
      search: AppSheetSearch(
        controller: _search,
        hint: l10n.documentsMentionSearch,
        onChanged: (_) => setState(() {}),
        startActive: true,
      ),
      slivers: [
        if (loading)
          const SliverToBoxAdapter(
            child: AppGroupedCard(children: [AppSkeletonRows(count: 4)]),
          ),
        if (_failed)
          SliverToBoxAdapter(
            child: AppGroupedCard(
              children: [
                AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                  tone: AppTone.destructive,
                ),
              ],
            ),
          ),
        if (!loading && options.isEmpty)
          SliverToBoxAdapter(
            child: AppGroupedCard(
              children: [
                AppStateMessage.inline(
                  icon: LucideIcons.searchX,
                  title: l10n.documentsMentionEmpty,
                ),
              ],
            ),
          ),
        for (final (type, items) in groups)
          if (items.isNotEmpty)
            SliverToBoxAdapter(
              child: AppGroupedSection(
                caption: _groupTitle(l10n, type),
                bottomGap: AppSpacing.md,
                children: [
                  for (final option in items) _MentionRow(option: option),
                ],
              ),
            ),
        if (query.trim().isEmpty)
          SliverToBoxAdapter(
            child: AppGroupedCard(
              children: [
                AppGroupedRow(
                  leading: const AppIconTile(
                    icon: LucideIcons.calendarPlus,
                    tone: AppTone.info,
                  ),
                  title: Text(l10n.documentsMentionCustomDate),
                  showChevron: true,
                  onTap: () =>
                      Navigator.of(context).pop(documentCustomDateOption),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

String _groupTitle(AppLocalizations l10n, DocumentMentionType type) =>
    switch (type) {
      DocumentMentionType.user => l10n.documentsMentionPeople,
      DocumentMentionType.workspace => l10n.documentsMentionWorkspaces,
      DocumentMentionType.project => l10n.documentsMentionProjects,
      DocumentMentionType.task => l10n.documentsMentionTasks,
      DocumentMentionType.date => l10n.documentsMentionDates,
    };

class _MentionRow extends StatelessWidget {
  const _MentionRow({required this.option});

  final DocumentMentionOption option;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, tone) = switch (option.type) {
      DocumentMentionType.user => (LucideIcons.user, AppTone.success),
      DocumentMentionType.workspace => (
        LucideIcons.briefcaseBusiness,
        AppTone.warning,
      ),
      DocumentMentionType.project => (LucideIcons.box, AppTone.info),
      DocumentMentionType.task => (LucideIcons.circleCheck, AppTone.primary),
      DocumentMentionType.date => (LucideIcons.calendar, AppTone.info),
    };
    final avatar = option.avatarUrl;
    final number = option.displayNumber;
    // Date shortcuts store the web's English name; the row shows ours.
    final label = switch (option.id) {
      'today' when option.type == DocumentMentionType.date =>
        l10n.documentsMentionToday,
      'tomorrow' when option.type == DocumentMentionType.date =>
        l10n.documentsMentionTomorrow,
      'next-week' when option.type == DocumentMentionType.date =>
        l10n.documentsMentionNextWeek,
      'next-month' when option.type == DocumentMentionType.date =>
        l10n.documentsMentionNextMonth,
      _ => option.label,
    };
    return AppGroupedRow(
      leading: avatar != null && avatar.trim().isNotEmpty
          ? NetworkAvatar(
              avatarUrl: avatar,
              radius: AppLayout.rowLeadingSize / 2,
              child: Icon(icon, size: 16),
            )
          : AppIconTile(icon: icon, tone: tone),
      title: Text(
        number != null ? '#$number $label' : label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: option.subtitle == null
          ? null
          : Text(
              option.subtitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
      onTap: () => Navigator.of(context).pop(option),
    );
  }
}
