import 'dart:async';

import 'package:flutter/material.dart' hide Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/repositories/cms_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CmsPage extends StatefulWidget {
  const CmsPage({super.key, this.repository});

  final CmsRepository? repository;

  @override
  State<CmsPage> createState() => _CmsPageState();
}

class _CmsPageState extends State<CmsPage> {
  static const _statuses = ['draft', 'scheduled', 'published', 'archived'];

  late final CmsRepository _repository;

  CmsSummary? _summary;
  List<CmsCollection> _collections = const <CmsCollection>[];
  List<CmsEntry> _entries = const <CmsEntry>[];
  String? _selectedCollectionId;
  String? _error;
  bool _isLoading = false;
  int _section = 0;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? CmsRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    if (widget.repository == null) {
      _repository.dispose();
    }
    super.dispose();
  }

  Future<void> _reload() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<dynamic>([
        _repository.getSummary(wsId),
        _repository.listCollections(wsId),
        _repository.listEntries(wsId, collectionId: _selectedCollectionId),
      ]);
      if (!mounted || requestToken != _requestToken) return;
      final collections = results[1] as List<CmsCollection>;
      setState(() {
        _summary = results[0] as CmsSummary;
        _collections = collections;
        _entries = results[2] as List<CmsEntry>;
        if (_selectedCollectionId != null &&
            !collections.any((item) => item.id == _selectedCollectionId)) {
          _selectedCollectionId = null;
        }
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.message);
    } on Object {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _reloadEntries() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      final entries = await _repository.listEntries(
        wsId,
        collectionId: _selectedCollectionId,
      );
      if (!mounted) return;
      setState(() => _entries = entries);
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _slugify(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp('[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
  }

  Future<void> _showCollectionEditor([CmsCollection? collection]) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final titleController = TextEditingController(text: collection?.title);
    final slugController = TextEditingController(text: collection?.slug);
    final typeController = TextEditingController(
      text: collection?.collectionType ?? 'articles',
    );
    final descriptionController = TextEditingController(
      text: collection?.description,
    );
    var enabled = collection?.isEnabled ?? true;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  collection == null
                      ? context.l10n.cmsNewCollection
                      : context.l10n.cmsEditCollection,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: InputDecoration(labelText: context.l10n.cmsTitle),
                  onChanged: (value) {
                    if (collection == null) {
                      slugController.text = _slugify(value);
                    }
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: slugController,
                  decoration: InputDecoration(labelText: context.l10n.cmsSlug),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: typeController,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsCollectionType,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsDescription,
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(context.l10n.cmsCollectionEnabled),
                  value: enabled,
                  onChanged: (value) => setSheetState(() => enabled = value),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(context.l10n.commonSave),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    final title = titleController.text.trim();
    final slug = slugController.text.trim();
    final type = typeController.text.trim();
    final description = descriptionController.text.trim();
    titleController.dispose();
    slugController.dispose();
    typeController.dispose();
    descriptionController.dispose();
    if (saved != true || title.isEmpty || slug.isEmpty || type.isEmpty) return;

    try {
      if (collection == null) {
        await _repository.createCollection(
          wsId,
          title: title,
          slug: slug,
          collectionType: type,
          description: description.isEmpty ? null : description,
        );
        if (!mounted) return;
        _toast(context.l10n.cmsCollectionCreated);
      } else {
        await _repository.updateCollection(
          wsId,
          collection.id,
          title: title,
          slug: slug,
          collectionType: type,
          description: description.isEmpty ? null : description,
          isEnabled: enabled,
        );
        if (!mounted) return;
        _toast(context.l10n.cmsCollectionUpdated);
      }
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showEntryEditor([CmsEntry? entry]) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    if (_collections.isEmpty) {
      _toast(context.l10n.cmsNoCollections, destructive: true);
      return;
    }

    final titleController = TextEditingController(text: entry?.title);
    final slugController = TextEditingController(text: entry?.slug);
    final subtitleController = TextEditingController(text: entry?.subtitle);
    final summaryController = TextEditingController(text: entry?.summary);
    var collectionId =
        entry?.collectionId ?? _selectedCollectionId ?? _collections.first.id;
    var status = entry?.status ?? 'draft';

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  entry == null
                      ? context.l10n.cmsNewEntry
                      : context.l10n.cmsEditEntry,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: collectionId,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsCollection,
                  ),
                  items: _collections
                      .map(
                        (collection) => DropdownMenuItem(
                          value: collection.id,
                          child: Text(collection.title),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: entry == null
                      ? (value) {
                          if (value == null) return;
                          setSheetState(() => collectionId = value);
                        }
                      : null,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: InputDecoration(labelText: context.l10n.cmsTitle),
                  onChanged: (value) {
                    if (entry == null) {
                      slugController.text = _slugify(value);
                    }
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: slugController,
                  decoration: InputDecoration(labelText: context.l10n.cmsSlug),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _statuses.contains(status) ? status : 'draft',
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsStatus,
                  ),
                  items: _statuses
                      .map(
                        (item) => DropdownMenuItem(
                          value: item,
                          child: Text(_statusLabel(context, item)),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value == null) return;
                    setSheetState(() => status = value);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: subtitleController,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsSubtitle,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: summaryController,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsSummary,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(context.l10n.commonSave),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    final title = titleController.text.trim();
    final slug = slugController.text.trim();
    final subtitle = subtitleController.text.trim();
    final summary = summaryController.text.trim();
    titleController.dispose();
    slugController.dispose();
    subtitleController.dispose();
    summaryController.dispose();
    if (saved != true || title.isEmpty || slug.isEmpty) return;

    try {
      if (entry == null) {
        await _repository.createEntry(
          wsId,
          collectionId: collectionId,
          title: title,
          slug: slug,
          status: status,
          subtitle: subtitle.isEmpty ? null : subtitle,
          summary: summary.isEmpty ? null : summary,
        );
        if (!mounted) return;
        _toast(context.l10n.cmsEntryCreated);
      } else {
        await _repository.updateEntry(
          wsId,
          entry.id,
          title: title,
          slug: slug,
          status: status,
          subtitle: subtitle.isEmpty ? null : subtitle,
          summary: summary.isEmpty ? null : summary,
        );
        if (!mounted) return;
        _toast(context.l10n.cmsEntryUpdated);
      }
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteEntry(CmsEntry entry) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final confirmed = await _confirm(
      title: context.l10n.cmsDeleteEntry,
      message: context.l10n.cmsDeleteEntryConfirm,
    );
    if (!confirmed) return;

    try {
      await _repository.deleteEntry(wsId, entry.id);
      if (!mounted) return;
      _toast(context.l10n.cmsEntryDeleted);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteCollection(CmsCollection collection) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final confirmed = await _confirm(
      title: context.l10n.cmsDeleteCollection,
      message: context.l10n.cmsDeleteCollectionConfirm,
    );
    if (!confirmed) return;

    try {
      await _repository.deleteCollection(wsId, collection.id);
      if (!mounted) return;
      _toast(context.l10n.cmsCollectionDeleted);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  void _toast(String message, {bool destructive = false}) {
    shad.showToast(
      context: context,
      builder: (context, overlay) => shad.SurfaceCard(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            message,
            style: TextStyle(color: destructive ? Colors.red : null),
          ),
        ),
      ),
    );
  }

  String _statusLabel(BuildContext context, String status) {
    return switch (status) {
      'published' => context.l10n.cmsStatusPublished,
      'scheduled' => context.l10n.cmsStatusScheduled,
      'archived' => context.l10n.cmsStatusArchived,
      _ => context.l10n.cmsStatusDraft,
    };
  }

  @override
  Widget build(BuildContext context) {
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        setState(() {
          _summary = null;
          _collections = const <CmsCollection>[];
          _entries = const <CmsEntry>[];
          _selectedCollectionId = null;
        });
        unawaited(_reload());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'cms-root-nav',
              locations: const {Routes.cms},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'cms-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.apps),
                ),
                ShellMiniNavItemSpec(
                  id: 'cms-overview',
                  icon: Icons.dashboard_customize_outlined,
                  label: context.l10n.cmsOverview,
                  callbackToken: _section,
                  selected: _section == 0,
                  enabled: hasWorkspace,
                  onPressed: () => setState(() => _section = 0),
                ),
                ShellMiniNavItemSpec(
                  id: 'cms-library',
                  icon: Icons.collections_bookmark_outlined,
                  label: context.l10n.cmsLibrary,
                  callbackToken: _section,
                  selected: _section == 1,
                  enabled: hasWorkspace,
                  onPressed: () => setState(() => _section = 1),
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'cms-root-actions',
              locations: const {Routes.cms},
              actions: [
                ShellActionSpec(
                  id: 'cms-refresh',
                  icon: Icons.refresh_rounded,
                  tooltip: context.l10n.commonRefresh,
                  callbackToken: _isLoading,
                  enabled: hasWorkspace && !_isLoading,
                  onPressed: _reload,
                ),
                ShellActionSpec(
                  id: 'cms-new-collection',
                  icon: Icons.create_new_folder_outlined,
                  tooltip: context.l10n.cmsNewCollection,
                  callbackToken: hasWorkspace,
                  enabled: hasWorkspace,
                  onPressed: _showCollectionEditor,
                ),
                ShellActionSpec(
                  id: 'cms-new-entry',
                  icon: Icons.add_rounded,
                  tooltip: context.l10n.cmsNewEntry,
                  callbackToken: _collections.length,
                  enabled: hasWorkspace && _collections.isNotEmpty,
                  highlighted: true,
                  onPressed: _showEntryEditor,
                ),
              ],
            ),
            ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: RefreshIndicator(
                onRefresh: _reload,
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    40 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    FinanceSectionHeader(
                      title: context.l10n.cmsTitleApp,
                      subtitle: context.l10n.cmsSubtitleApp,
                    ),
                    const SizedBox(height: 12),
                    _CmsSegmentedControl(
                      section: _section,
                      onChanged: (value) => setState(() => _section = value),
                    ),
                    const SizedBox(height: 16),
                    if (_isLoading && _summary == null)
                      const SizedBox(
                        height: 260,
                        child: Center(child: NovaLoadingIndicator()),
                      )
                    else if (_error != null)
                      _CmsMessageCard(message: _error!)
                    else if (_section == 0)
                      _buildOverview(context)
                    else
                      _buildLibrary(context),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOverview(BuildContext context) {
    final summary = _summary;
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

  Widget _buildLibrary(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: _selectedCollectionId,
          decoration: InputDecoration(labelText: context.l10n.cmsCollection),
          items: [
            DropdownMenuItem<String>(
              child: Text(context.l10n.cmsAllCollections),
            ),
            ..._collections.map(
              (collection) => DropdownMenuItem(
                value: collection.id,
                child: Text(collection.title),
              ),
            ),
          ],
          onChanged: (value) {
            setState(() => _selectedCollectionId = value);
            unawaited(_reloadEntries());
          },
        ),
        const SizedBox(height: 16),
        Text(
          context.l10n.cmsCollections,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        if (_collections.isEmpty)
          _CmsMessageCard(message: context.l10n.cmsNoCollections)
        else
          ..._collections.map(
            (collection) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _CollectionTile(
                collection: collection,
                onEdit: () => _showCollectionEditor(collection),
                onDelete: () => _deleteCollection(collection),
              ),
            ),
          ),
        const SizedBox(height: 8),
        Text(
          context.l10n.cmsEntries,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        if (_entries.isEmpty)
          _CmsMessageCard(message: context.l10n.cmsNoEntries)
        else
          ..._entries.map(
            (entry) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _EntryTile(
                entry: entry,
                collectionTitle: _collections
                    .where((collection) => collection.id == entry.collectionId)
                    .map((collection) => collection.title)
                    .firstOrNull,
                statusLabel: _statusLabel(context, entry.status),
                onEdit: () => _showEntryEditor(entry),
                onDelete: () => _deleteEntry(entry),
              ),
            ),
          ),
      ],
    );
  }
}

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
    return GridView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 1.55,
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
          Text(
            item.title,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
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
