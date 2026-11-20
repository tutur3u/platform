import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/documents_labels.dart';
import 'package:mobile/features/documents/view/document_editor.dart';
import 'package:mobile/features/documents/view/document_share_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class DocumentDetailPage extends StatefulWidget {
  const DocumentDetailPage({
    required this.documentId,
    super.key,
    this.repository,
    this.onSaved,
  });

  final String documentId;
  final DocumentRepository? repository;
  final VoidCallback? onSaved;

  @override
  State<DocumentDetailPage> createState() => _DocumentDetailPageState();
}

class _DocumentDetailPageState extends State<DocumentDetailPage> {
  static const Duration _autosaveDelay = Duration(milliseconds: 800);

  late final DocumentRepository _repository;
  final TextEditingController _title = TextEditingController();
  final QuillController _editor = QuillController.basic();
  final FocusNode _editorFocus = FocusNode();
  final ScrollController _editorScroll = ScrollController();

  WorkspaceDocument? _document;
  bool _isLoading = true;
  bool _isPublic = false;
  bool _hydrating = false;
  bool _dirty = false;
  bool _closed = false;
  DocumentSaveStatus _status = DocumentSaveStatus.idle;
  String? _error;
  String? _wsIdCache;
  int _requestToken = 0;
  Timer? _saveTimer;
  Future<void> _pendingSave = Future<void>.value();
  StreamSubscription<DocChange>? _changes;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? DocumentRepository();
    _editor.addListener(_onEditorNotice);
    unawaited(Future<void>.delayed(Duration.zero, _load));
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    unawaited(_changes?.cancel());
    _editor.removeListener(_onEditorNotice);
    _closed = true;
    final pending = _persist();
    _editor.dispose();
    _editorFocus.dispose();
    _editorScroll.dispose();
    _title.dispose();
    if (widget.repository == null) {
      unawaited(pending.whenComplete(_repository.dispose));
    }
    super.dispose();
  }

  void _rememberWorkspace() {
    final id = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (id != null && id.isNotEmpty) _wsIdCache = id;
  }

  void _watchDocument() {
    unawaited(_changes?.cancel());
    _changes = _editor.document.changes.listen((_) {
      if (_hydrating || _closed) return;
      _scheduleSave();
    });
  }

  void _onEditorNotice() {
    if (!mounted || _hydrating || _closed) return;
    setState(() {});
  }

  Future<void> _load() async {
    _rememberWorkspace();
    final wsId = _wsIdCache;
    if (wsId == null || wsId.isEmpty) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    final requestToken = ++_requestToken;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final document = await _repository.getDocument(wsId, widget.documentId);
      if (!mounted || requestToken != _requestToken || _closed) return;
      _hydrating = true;
      _title.text = document.name;
      _editor.document = documentQuillFromContent(document.content);
      _watchDocument();
      _hydrating = false;
      _dirty = false;
      setState(() {
        _document = document;
        _isPublic = document.isPublic;
        _status = DocumentSaveStatus.idle;
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

  void _scheduleSave() {
    if (_hydrating || _closed || _document == null) return;
    _dirty = true;
    _rememberWorkspace();
    _saveTimer?.cancel();
    _saveTimer = Timer(_autosaveDelay, () => unawaited(_persist()));
  }

  Future<void> _persist() {
    if (!_dirty || _document == null) return _pendingSave;
    final wsId = _wsIdCache;
    if (wsId == null || wsId.isEmpty) return _pendingSave;
    _dirty = false;
    _saveTimer?.cancel();
    final name = _title.text;
    final content = documentContentPayload(_editor.document);
    final onSaved = widget.onSaved;
    final documentId = widget.documentId;
    if (mounted && !_closed) {
      setState(() => _status = DocumentSaveStatus.saving);
    }
    return _pendingSave = _pendingSave.then((_) async {
      try {
        await _repository.updateDocument(
          wsId,
          documentId,
          name: name,
          content: content,
        );
        onSaved?.call();
        if (!mounted || _closed) return;
        setState(() {
          _status = DocumentSaveStatus.saved;
          _document = _document?.copyWith(
            name: name,
            content: content is String ? content : jsonEncode(content),
          );
        });
      } on Object {
        _dirty = true;
        if (!mounted || _closed) return;
        setState(() => _status = DocumentSaveStatus.error);
      }
    });
  }

  Future<bool> _setPublic(bool value) async {
    _rememberWorkspace();
    final wsId = _wsIdCache;
    final document = _document;
    if (wsId == null || wsId.isEmpty || document == null) return false;
    try {
      await _repository.updateDocument(
        wsId,
        widget.documentId,
        isPublic: value,
      );
      if (mounted) {
        setState(() {
          _isPublic = value;
          _document = document.copyWith(isPublic: value);
        });
      }
      return true;
    } on ApiException catch (error) {
      if (mounted) _toast(error.message, destructive: true);
      return false;
    } on Object {
      if (mounted) {
        _toast(context.l10n.commonSomethingWentWrong, destructive: true);
      }
      return false;
    }
  }

  Future<void> _delete() async {
    _rememberWorkspace();
    final wsId = _wsIdCache;
    if (wsId == null || wsId.isEmpty) return;

    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.documentsDelete,
        content: Text(context.l10n.documentsDeleteConfirm),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.destructive(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      _closed = true;
      _dirty = false;
      _saveTimer?.cancel();
      await _pendingSave;
      await _repository.deleteDocument(wsId, widget.documentId);
      if (!mounted) return;
      _toast(context.l10n.documentsDeleted);
      context.go(Routes.documents);
    } on ApiException catch (error) {
      _closed = false;
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _editLink() async {
    final current = _editor
        .getSelectionStyle()
        .attributes[Attribute.link.key]
        ?.value;
    final initial = current is String ? current : '';
    final url = await showAppDialog<String>(
      context: context,
      builder: (context) => _LinkDialog(initial: initial),
    );
    if (url == null || !mounted) return;
    if (url.isEmpty) {
      _editor.formatSelection(const LinkAttribute(null));
    } else {
      final href = url.contains('://') ? url : 'https://$url';
      _editor.formatSelection(LinkAttribute(href));
    }
  }

  Future<void> _openShare() {
    return showAppSheet<void>(
      context: context,
      builder: (context) => DocumentShareSheet(
        isPublic: _isPublic,
        onPublicChanged: _setPublic,
        onDelete: () {
          Navigator.of(context).pop();
          unawaited(_delete());
        },
      ),
    );
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final document = _document;
    final editedAt = documentEditedAt(document?.editedAtRaw ?? '');
    final edited = editedAt == null
        ? null
        : DateFormat.yMMMd(l10n.localeName).add_jm().format(editedAt.toLocal());
    final ready = !_isLoading && _error == null && _document != null;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final dock = MediaQuery.paddingOf(context).bottom;
    final lift = keyboard > 0 ? keyboard : dock;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        if (_closed) return;
        _closed = true;
        _saveTimer?.cancel();
        unawaited(_persist());
        context.go(Routes.documents);
      },
      child: AppScaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'document-detail-nav',
              locations: {Routes.documentDetailPath(widget.documentId)},
              deepLinkBackRoute: Routes.documents,
              items: const [],
            ),
            ShellChromeActions(
              ownerId: 'document-detail-actions',
              locations: {Routes.documentDetailPath(widget.documentId)},
              actions: [
                ShellActionSpec(
                  id: 'document-share',
                  icon: LucideIcons.share2,
                  tooltip: l10n.documentsShare,
                  callbackToken: _isPublic,
                  enabled: ready,
                  onPressed: () => unawaited(_openShare()),
                ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: AppPageBody(
                    kind: AppPageKind.reading,
                    consumeBottomClearance: false,
                    child: _isLoading
                        ? const AppLoadingIndicator.page()
                        : _error != null
                        ? AppStateMessage(
                            icon: LucideIcons.circleAlert,
                            title: l10n.commonSomethingWentWrong,
                            message: _error,
                            tone: AppTone.destructive,
                            actionLabel: l10n.commonRetry,
                            onAction: _load,
                          )
                        : document == null
                        ? AppStateMessage(
                            icon: LucideIcons.fileText,
                            title: l10n.documentsTitle,
                            message: l10n.documentsEmptyDescription,
                          )
                        : DocumentEditor(
                            title: _title,
                            editor: _editor,
                            focusNode: _editorFocus,
                            scrollController: _editorScroll,
                            status: _status,
                            owner: documentOwnerLabel(document, l10n),
                            lastEdited: edited,
                            onTitleChanged: (_) => _scheduleSave(),
                          ),
                  ),
                ),
                if (ready)
                  Padding(
                    padding: EdgeInsets.only(bottom: lift),
                    child: AppFormatToolbar(
                      actions: documentFormatActions(
                        context: context,
                        editor: _editor,
                        onLink: () => unawaited(_editLink()),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LinkDialog extends StatefulWidget {
  const _LinkDialog({required this.initial});

  final String initial;

  @override
  State<_LinkDialog> createState() => _LinkDialogState();
}

class _LinkDialogState extends State<_LinkDialog> {
  late final TextEditingController _url = TextEditingController(
    text: widget.initial,
  );

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppDialog(
      title: l10n.documentsLinkTitle,
      content: AppTextField(
        controller: _url,
        autofocus: true,
        placeholder: l10n.documentsLinkPlaceholder,
        keyboardType: TextInputType.url,
        textInputAction: TextInputAction.done,
        onSubmitted: (value) => Navigator.of(context).pop(value.trim()),
      ),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        AppButton.primary(
          onPressed: () => Navigator.of(context).pop(_url.text.trim()),
          child: Text(l10n.commonSave),
        ),
      ],
    );
  }
}
