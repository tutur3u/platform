import 'dart:async';

import 'package:flutter/material.dart' hide Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/repositories/document_repository.dart';
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

class DocumentsPage extends StatefulWidget {
  const DocumentsPage({super.key, this.repository});

  final DocumentRepository? repository;

  @override
  State<DocumentsPage> createState() => _DocumentsPageState();
}

class _DocumentsPageState extends State<DocumentsPage> {
  static const int _pageSize = 30;

  late final DocumentRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  List<WorkspaceDocument> _documents = const <WorkspaceDocument>[];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;
  int _offset = 0;
  int _total = 0;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  bool get _hasMore => _documents.length < _total;

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

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore || !_hasMore) return;
    await _reload(append: true);
  }

  Future<void> _createDocument() async {
    final controller = TextEditingController();
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.l10n.documentsNewDocument,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: InputDecoration(
                labelText: context.l10n.documentsDocumentName,
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(context.l10n.commonCreate),
            ),
          ],
        ),
      ),
    );

    final wsId = _wsId;
    final name = controller.text.trim();
    controller.dispose();
    if (created != true || wsId == null || name.isEmpty) return;

    try {
      final documentId = await _repository.createDocument(wsId, name: name);
      if (!mounted) return;
      _toast(context.l10n.documentsCreated);
      await _reload();
      if (!mounted || documentId.isEmpty) return;
      unawaited(context.push(Routes.documentDetailPath(documentId)));
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
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

  @override
  Widget build(BuildContext context) {
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        setState(() => _documents = const <WorkspaceDocument>[]);
        unawaited(_reload());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'documents-root-nav',
              locations: const {Routes.documents},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'documents-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.apps),
                ),
                ShellMiniNavItemSpec(
                  id: 'documents-home',
                  icon: Icons.description_outlined,
                  label: context.l10n.documentsTitle,
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
              actions: [
                ShellActionSpec(
                  id: 'documents-refresh',
                  icon: Icons.refresh_rounded,
                  tooltip: context.l10n.commonRefresh,
                  callbackToken: _isLoading,
                  enabled: hasWorkspace && !_isLoading,
                  onPressed: _reload,
                ),
                ShellActionSpec(
                  id: 'documents-create',
                  icon: Icons.add_rounded,
                  tooltip: context.l10n.documentsNewDocument,
                  callbackToken: hasWorkspace,
                  enabled: hasWorkspace,
                  onPressed: _createDocument,
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
                      title: context.l10n.documentsTitle,
                      subtitle: context.l10n.documentsSubtitle,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _searchController,
                      onChanged: _onSearchChanged,
                      decoration: InputDecoration(
                        hintText: context.l10n.documentsSearchHint,
                        prefixIcon: const Icon(Icons.search_rounded),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_isLoading && _documents.isEmpty)
                      const SizedBox(
                        height: 240,
                        child: Center(child: NovaLoadingIndicator()),
                      )
                    else if (_error != null)
                      _DocumentsMessageCard(message: _error!)
                    else if (_documents.isEmpty)
                      _DocumentsMessageCard(
                        message: context.l10n.documentsEmptyDescription,
                      )
                    else
                      ..._documents.map(
                        (document) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _DocumentTile(
                            document: document,
                            onTap: () => context.push(
                              Routes.documentDetailPath(document.id),
                            ),
                          ),
                        ),
                      ),
                    if (_hasMore) ...[
                      const SizedBox(height: 8),
                      Center(
                        child: FilledButton.tonal(
                          onPressed: _isLoadingMore ? null : _loadMore,
                          child: _isLoadingMore
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : Text(context.l10n.commonLoadMore),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.document, required this.onTap});

  final WorkspaceDocument document;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      borderColor: document.isPublic
          ? theme.colorScheme.primary.withValues(alpha: 0.45)
          : null,
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              Icons.description_outlined,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  document.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (document.content.trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    document.content.trim(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Icon(
            document.isPublic
                ? Icons.public_rounded
                : Icons.lock_outline_rounded,
            color: theme.colorScheme.mutedForeground,
          ),
        ],
      ),
    );
  }
}

class _DocumentsMessageCard extends StatelessWidget {
  const _DocumentsMessageCard({required this.message});

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
