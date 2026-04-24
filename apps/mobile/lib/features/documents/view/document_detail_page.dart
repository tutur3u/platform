import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class DocumentDetailPage extends StatefulWidget {
  const DocumentDetailPage({
    required this.documentId,
    super.key,
    this.repository,
  });

  final String documentId;
  final DocumentRepository? repository;

  @override
  State<DocumentDetailPage> createState() => _DocumentDetailPageState();
}

class _DocumentDetailPageState extends State<DocumentDetailPage> {
  late final DocumentRepository _repository;
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _contentController = TextEditingController();

  WorkspaceDocument? _document;
  bool _isLoading = false;
  bool _isSaving = false;
  bool _isPublic = false;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? DocumentRepository();
    unawaited(Future<void>.delayed(Duration.zero, _load));
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    if (widget.repository == null) {
      _repository.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final document = await _repository.getDocument(wsId, widget.documentId);
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _document = document;
        _titleController.text = document.name;
        _contentController.text = document.content;
        _isPublic = document.isPublic;
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

  Future<void> _save() async {
    final wsId = _wsId;
    final name = _titleController.text.trim();
    if (wsId == null || wsId.isEmpty || name.isEmpty || _isSaving) return;

    setState(() => _isSaving = true);
    try {
      await _repository.updateDocument(
        wsId,
        widget.documentId,
        name: name,
        content: _contentController.text,
        isPublic: _isPublic,
      );
      if (!mounted) return;
      setState(() {
        _document =
            (_document ??
                    WorkspaceDocument(
                      id: widget.documentId,
                      name: name,
                      content: _contentController.text,
                      isPublic: _isPublic,
                    ))
                .copyWith(
                  name: name,
                  content: _contentController.text,
                  isPublic: _isPublic,
                );
      });
      _toast(context.l10n.documentsUpdated);
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _delete() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.documentsDelete),
        content: Text(context.l10n.documentsDeleteConfirm),
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
    if (confirmed != true) return;

    try {
      await _repository.deleteDocument(wsId, widget.documentId);
      if (!mounted) return;
      _toast(context.l10n.documentsDeleted);
      context.go(Routes.documents);
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
    final title = _titleController.text.trim().isEmpty
        ? context.l10n.documentsTitle
        : _titleController.text.trim();

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => context.go(Routes.documents),
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'document-detail-nav',
              locations: {Routes.documentDetailPath(widget.documentId)},
              deepLinkBackRoute: Routes.documents,
              items: [
                ShellMiniNavItemSpec(
                  id: 'document-detail-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.documents),
                ),
                ShellMiniNavItemSpec(
                  id: 'document-detail-editor',
                  icon: Icons.description_outlined,
                  label: context.l10n.documentsEditor,
                  callbackToken: widget.documentId,
                  selected: true,
                  onPressed: () {},
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'document-detail-actions',
              locations: {Routes.documentDetailPath(widget.documentId)},
              actions: [
                ShellActionSpec(
                  id: 'document-save',
                  icon: Icons.check_rounded,
                  tooltip: context.l10n.commonSave,
                  callbackToken: _isSaving,
                  enabled: !_isSaving,
                  highlighted: true,
                  onPressed: _save,
                ),
                ShellActionSpec(
                  id: 'document-delete',
                  icon: Icons.delete_outline_rounded,
                  tooltip: context.l10n.commonDelete,
                  callbackToken: widget.documentId,
                  enabled: !_isSaving && _document != null,
                  onPressed: _delete,
                ),
              ],
            ),
            SafeArea(
              bottom: false,
              child: _isLoading
                  ? const Center(child: NovaLoadingIndicator())
                  : _error != null
                  ? Center(child: Text(_error!))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _titleController,
                                decoration: InputDecoration(
                                  labelText: context.l10n.documentsDocumentName,
                                ),
                                onChanged: (_) => setState(() {}),
                              ),
                              const SizedBox(height: 10),
                              SwitchListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(context.l10n.documentsPublic),
                                value: _isPublic,
                                onChanged: (value) {
                                  setState(() => _isPublic = value);
                                },
                              ),
                            ],
                          ),
                        ),
                        const Divider(height: 1),
                        Expanded(
                          child: TextField(
                            controller: _contentController,
                            expands: true,
                            maxLines: null,
                            textAlignVertical: TextAlignVertical.top,
                            keyboardType: TextInputType.multiline,
                            decoration: InputDecoration(
                              hintText: context.l10n.documentsContentHint,
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.fromLTRB(
                                20,
                                20,
                                20,
                                32 + MediaQuery.paddingOf(context).bottom,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
