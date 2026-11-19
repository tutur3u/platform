import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/documents_labels.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class DocumentsPage extends StatefulWidget {
  const DocumentsPage({super.key, this.repository});

  final DocumentRepository? repository;

  @override
  State<DocumentsPage> createState() => _DocumentsPageState();
}

class _DocumentsPageState extends State<DocumentsPage> {
  static const int _pageSize = DocumentRepository.screenPageSize;

  late final DocumentRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  List<WorkspaceDocument> _documents = const <WorkspaceDocument>[];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _isCreating = false;
  bool _searching = false;
  String? _error;
  int _offset = 0;
  int _total = 0;
  int _requestToken = 0;
  DocumentVisibilityFilter _visibility = DocumentVisibilityFilter.all;
  DocumentSort _sort = DocumentSort.edited;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  bool get _hasMore => _documents.length < _total;

  String _ownerLabel(WorkspaceDocument document, AppLocalizations l10n) {
    if (document.ownerIsViewer) return l10n.documentsOwnerYou;
    final name = document.ownerName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return l10n.documentsOwnerUnknown;
  }

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? DocumentRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    if (widget.repository == null) {
      _repository.dispose();
    }
    super.dispose();
  }

  Future<void> _reload({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;
    final nextOffset = append ? _offset + _pageSize : 0;
    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _error = null;
      }
    });

    try {
      final page = await _repository.listDocuments(
        wsId,
        search: _searchController.text,
        limit: _pageSize,
        offset: nextOffset,
      );
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _documents = append
            ? <WorkspaceDocument>[..._documents, ...page.documents]
            : page.documents;
        _offset = page.offset;
        _total = page.total;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.message);
    } on Object {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(_reload());
    });
  }

  void _closeSearch() {
    _searchDebounce?.cancel();
    _searchController.clear();
    setState(() => _searching = false);
    unawaited(_reload());
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore || !_hasMore) return;
    await _reload(append: true);
  }

  Future<void> _createDocument() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty || _isCreating) return;
    setState(() => _isCreating = true);
    try {
      final documentId = await _repository.createDocument(wsId, name: '');
      if (!mounted) return;
      if (documentId.isEmpty) return;
      unawaited(context.push(Routes.documentDetailPath(documentId)));
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  Future<void> _pickSort() async {
    final picked = await showAppChoiceSheet<DocumentSort>(
      context: context,
      title: context.l10n.documentsSort,
      selected: _sort,
      choices: [
        AppSheetChoice(
          value: DocumentSort.edited,
          label: context.l10n.documentsSortEdited,
          icon: LucideIcons.clock,
        ),
        AppSheetChoice(
          value: DocumentSort.title,
          label: context.l10n.documentsSortTitle,
          icon: LucideIcons.caseSensitive,
        ),
      ],
    );
    if (picked == null || !mounted) return;
    setState(() => _sort = picked);
  }

  void _toast(String message, {bool destructive = false}) {
    showAppToast(
      context,
      message: message,
      variant: destructive
          ? AppAlertVariant.destructive
          : AppAlertVariant.neutral,
    );
  }

  List<WorkspaceDocument> _visible(String locale) {
    final filtered =
        _documents.where((document) {
          return switch (_visibility) {
            DocumentVisibilityFilter.all => true,
            DocumentVisibilityFilter.privateOnly => !document.isPublic,
            DocumentVisibilityFilter.publicOnly => document.isPublic,
          };
        }).toList()..sort((a, b) {
          if (_sort == DocumentSort.title) {
            final titleA = documentDisplayTitle(
              name: a.name,
              untitled: '',
              editedAt: documentEditedAt(a.editedAtRaw),
              locale: locale,
            );
            final titleB = documentDisplayTitle(
              name: b.name,
              untitled: '',
              editedAt: documentEditedAt(b.editedAtRaw),
              locale: locale,
            );
            return titleA.toLowerCase().compareTo(titleB.toLowerCase());
          }
          final aTime = documentEditedAt(a.editedAtRaw);
          final bTime = documentEditedAt(b.editedAtRaw);
          if (aTime == null && bTime == null) return 0;
          if (aTime == null) return 1;
          if (bTime == null) return -1;
          return bTime.compareTo(aTime);
        });
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final visible = _visible(locale);

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        setState(() => _documents = const <WorkspaceDocument>[]);
        unawaited(_reload());
      },
      child: AppScaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'documents-root-nav',
              locations: const {Routes.documents},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'documents-home',
                  icon: LucideIcons.fileText,
                  label: l10n.documentsTitle,
                  callbackToken: true,
                  selected: true,
                  enabled: hasWorkspace,
                  onPressed: () {},
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'documents-root-actions',
              locations: const {Routes.documents},
              onResetSection: _closeSearch,
              actions: [
                ShellActionSpec.search(
                  id: 'documents-search',
                  active: _searching,
                  tooltip: l10n.documentsSearchHint,
                  controller: _searchController,
                  searchHint: l10n.documentsSearchHint,
                  hasQuery: _searchController.text.trim().isNotEmpty,
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _closeSearch,
                  onPressed: () {
                    if (_searching) {
                      _closeSearch();
                    } else {
                      setState(() => _searching = true);
                    }
                  },
                ),
                ShellActionSpec(
                  id: 'documents-sort',
                  icon: LucideIcons.arrowUpDown,
                  tooltip: l10n.documentsSort,
                  callbackToken: _sort,
                  enabled: hasWorkspace,
                  highlighted: _sort != DocumentSort.edited,
                  onPressed: _pickSort,
                ),
                ShellActionSpec(
                  id: 'documents-create',
                  icon: LucideIcons.plus,
                  tooltip: l10n.documentsNewDocument,
                  callbackToken: _isCreating,
                  enabled: hasWorkspace && !_isCreating,
                  onPressed: _createDocument,
                ),
              ],
            ),
            NovaRefreshIndicator(
              onRefresh: _reload,
              child: AppPageListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  AppFilterBar<DocumentVisibilityFilter>(
                    options: [
                      AppFilterOption(
                        value: DocumentVisibilityFilter.all,
                        label: l10n.documentsFilterAll,
                      ),
                      AppFilterOption(
                        value: DocumentVisibilityFilter.privateOnly,
                        label: l10n.documentsFilterPrivate,
                        icon: LucideIcons.lock,
                      ),
                      AppFilterOption(
                        value: DocumentVisibilityFilter.publicOnly,
                        label: l10n.documentsFilterPublic,
                        icon: LucideIcons.globe,
                      ),
                    ],
                    selected: _visibility,
                    onSelected: (value) => setState(() => _visibility = value),
                  ),
                  const SizedBox(height: AppLayout.itemGap),
                  if (!hasWorkspace)
                    AppStateMessage(
                      icon: LucideIcons.fileText,
                      title: l10n.documentsTitle,
                      message: l10n.documentsEmptyDescription,
                    )
                  else if (_isLoading && _documents.isEmpty)
                    const AppSkeletonRows(count: 6)
                  else if (_error != null)
                    AppStateMessage(
                      icon: LucideIcons.circleAlert,
                      title: l10n.commonSomethingWentWrong,
                      message: _error,
                      tone: AppTone.destructive,
                      actionLabel: l10n.commonRetry,
                      onAction: _reload,
                    )
                  else if (visible.isEmpty)
                    AppStateMessage(
                      icon: LucideIcons.fileText,
                      title: l10n.documentsTitle,
                      message: _documents.isEmpty
                          ? l10n.documentsEmptyDescription
                          : l10n.documentsEmptyFiltered,
                    )
                  else
                    AppGroupedCard(
                      children: [
                        for (final document in visible)
                          PendingSyncFrame(
                            workspaceId: _wsId ?? '',
                            feature: 'documents',
                            entityId: document.id,
                            child: _DocumentRow(
                              document: document,
                              owner: _ownerLabel(document, l10n),
                              locale: locale,
                              onTap: () => context.push(
                                Routes.documentDetailPath(document.id),
                              ),
                            ),
                          ),
                      ],
                    ),
                  if (_hasMore) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Center(
                      child: AppButton.secondary(
                        onPressed: _isLoadingMore ? null : _loadMore,
                        child: _isLoadingMore
                            ? const AppLoadingIndicator.inline()
                            : Text(l10n.commonLoadMore),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({
    required this.document,
    required this.owner,
    required this.locale,
    required this.onTap,
  });

  final WorkspaceDocument document;
  final String owner;
  final String locale;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final editedAt = documentEditedAt(document.editedAtRaw);
    final title = documentDisplayTitle(
      name: document.name,
      untitled: l10n.documentsUntitled,
      editedAt: editedAt,
      locale: locale,
    );
    final edited = editedAt == null
        ? null
        : DateFormat.MMMd(locale).format(editedAt.toLocal());
    final visibility = document.isPublic
        ? l10n.documentsVisibilityPublic
        : l10n.documentsVisibilityPrivate;
    return AppRichRow(
      title: title,
      leading: const AppIconTile(
        icon: LucideIcons.fileText,
        tone: AppTone.primary,
      ),
      meta: [
        if (edited != null) AppMetaItem(icon: LucideIcons.clock, label: edited),
        AppMetaItem(icon: LucideIcons.user, label: owner),
      ],
      trailing: Icon(
        document.isPublic ? LucideIcons.globe : LucideIcons.lock,
        size: 16,
      ),
      semanticLabel: '$title, $owner, $visibility',
      onTap: onTap,
    );
  }
}
