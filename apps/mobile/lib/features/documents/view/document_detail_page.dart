import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/document_media_upload.dart';
import 'package:mobile/features/documents/document_mention_source.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/documents_labels.dart';
import 'package:mobile/features/documents/view/document_editor.dart';
import 'package:mobile/features/documents/view/document_format_actions.dart';
import 'package:mobile/features/documents/view/document_format_toolbar.dart';
import 'package:mobile/features/documents/view/document_image_embed.dart';
import 'package:mobile/features/documents/view/document_input_rules.dart';
import 'package:mobile/features/documents/view/document_inserts.dart';
import 'package:mobile/features/documents/view/document_share_sheet.dart';
import 'package:mobile/features/documents/view/document_table_embed.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class DocumentDetailPage extends StatefulWidget {
  const DocumentDetailPage({
    required this.documentId,
    super.key,
    this.repository,
    this.onSaved,
    this.uploader,
    this.mentionSource,
    this.mediaPicker,
    this.linkOpener,
  });

  final String documentId;
  final DocumentRepository? repository;
  final VoidCallback? onSaved;

  /// Uploads inserted media; defaults to the workspace storage flow.
  final DocumentMediaUploader? uploader;

  /// What `@` can mention in a workspace; defaults to its members, the
  /// workspace, projects and tasks.
  final DocumentMentionSource Function(Workspace workspace)? mentionSource;

  /// Picks media to insert; defaults to the platform pickers.
  final DocumentMediaPicker? mediaPicker;

  /// Opens a tapped link; defaults to opening it with the session.
  final ValueChanged<String>? linkOpener;

  @override
  State<DocumentDetailPage> createState() => _DocumentDetailPageState();
}

class _DocumentDetailPageState extends State<DocumentDetailPage> {
  static const Duration _autosaveDelay = Duration(milliseconds: 800);

  late final DocumentRepository _repository;
  late final DocumentMediaUploader _uploader =
      widget.uploader ?? DocumentMediaUploader();
  Future<List<DocumentMentionOption>>? _mentionOptions;
  final TextEditingController _title = TextEditingController();
  final QuillController _editor = QuillController.basic();
  final FocusNode _editorFocus = FocusNode();
  final ScrollController _editorScroll = ScrollController();

  WorkspaceDocument? _document;
  DocumentContentSnapshot? _snapshot;
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
    if (widget.uploader == null) _uploader.dispose();
    super.dispose();
  }

  void _rememberWorkspace() {
    final id = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (id != null && id.isNotEmpty) _wsIdCache = id;
  }

  void _watchDocument() {
    unawaited(_changes?.cancel());
    _changes = _editor.document.changes.listen((change) {
      if (_hydrating || _closed) return;
      _scheduleSave();
      final typed = documentTypedCharacter(change);
      if (typed == null) return;
      // After the keystroke settles, as the web's input rules run.
      scheduleMicrotask(() {
        if (_closed || !mounted) return;
        applyDocumentInputRules(
          _editor,
          offset: typed.offset,
          typed: typed.typed,
        );
        // A typed `@` opens the mention picker, as on the web.
        if (typed.typed == '@' &&
            startsDocumentMention(
              _editor.document.toPlainText(),
              typed.offset,
            ) &&
            !documentOffsetIsCode(_editor, typed.offset)) {
          unawaited(_mention(trigger: typed.offset));
        }
      });
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
      final snapshot = DocumentContentSnapshot.parse(document.content);
      _snapshot = snapshot;
      _editor.document = snapshot.toQuill();
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
    final content = documentContentPayload(_editor.document, _snapshot);
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

  /// The shell title is the document title. Renames are applied locally and
  /// sent through the offline-capable save queue, so they never block on the
  /// network and survive a dropped connection.
  Future<void> _rename(String name) async {
    final document = _document;
    if (_closed || document == null) return;
    var next = name.trim();
    // An untitled document shows "Untitled · Nov 19". The editor opens on
    // that label, so text typed after it must not save the label as well.
    if (documentNameIsUntitled(_title.text)) {
      final l10n = context.l10n;
      final shown = documentDisplayTitle(
        name: _title.text,
        untitled: l10n.documentsUntitled,
        editedAt: documentEditedAt(document.editedAtRaw),
        locale: l10n.localeName,
      );
      if (next.startsWith(shown)) next = next.substring(shown.length).trim();
    }
    if (next.isEmpty) return;
    if (next == _title.text.trim()) return;
    setState(() => _title.text = next);
    _scheduleSave();
    unawaited(_persist());
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

  Future<void> _pickColor(DocumentColorChannel channel) async {
    final hue = await showAppSheet<String>(
      context: context,
      builder: (context) => DocumentSwatchSheet(channel: channel),
    );
    if (hue == null || !mounted) return;
    applyDocumentSwatch(_editor, channel, hue.isEmpty ? null : hue);
  }

  Future<void> _mention({int? trigger}) {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (workspace == null) return Future<void>.value();
    final l10n = context.l10n;
    final source =
        widget.mentionSource?.call(workspace) ??
        TaskDocumentMentionSource(
          workspace,
          fallbacks: (
            workspace: l10n.documentsMentionWorkspace,
            untitledProject: l10n.documentsMentionUntitledProject,
            untitledTask: l10n.documentsMentionUntitledTask,
          ),
        );
    // A loaded list is reused; a failed load is dropped so the next
    // opening tries again.
    var options = _mentionOptions;
    if (options == null) {
      final loading = source.load();
      _mentionOptions = options = loading;
      unawaited(
        loading.then<void>(
          (_) {},
          onError: (Object _) {
            if (identical(_mentionOptions, loading)) _mentionOptions = null;
          },
        ),
      );
    }
    return insertDocumentMention(
      context,
      _editor,
      options: options,
      searchTasks: source.searchTasks,
      trigger: trigger,
    );
  }

  void _insert(DocumentInsertKind kind) {
    _rememberWorkspace();
    final wsId = _wsIdCache;
    if (wsId == null || wsId.isEmpty) return;
    final media = switch (kind) {
      DocumentInsertKind.image => DocumentMediaKind.image,
      DocumentInsertKind.camera => DocumentMediaKind.camera,
      DocumentInsertKind.video => DocumentMediaKind.video,
      DocumentInsertKind.file => DocumentMediaKind.file,
      _ => null,
    };
    unawaited(switch (kind) {
      DocumentInsertKind.table => insertDocumentTable(context, _editor),
      DocumentInsertKind.mention => _mention(),
      _ => insertDocumentMedia(
        context,
        _editor,
        kind: media!,
        wsId: wsId,
        uploader: _uploader,
        pick: widget.mediaPicker ?? pickDocumentMedia,
      ),
    });
  }

  Future<void> _editImage(int offset, Map<String, dynamic> node) async {
    final action = await showAppSheet<DocumentImageAction>(
      context: context,
      builder: (_) => DocumentImageSheet(node: node),
    );
    if (action == null || !mounted) return;
    applyDocumentImageAction(context, _editor, offset, node, action);
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
            ShellTitleOverride(
              ownerId: 'document-detail-title',
              locations: {Routes.documentDetailPath(widget.documentId)},
              title: ready
                  ? documentDisplayTitle(
                      name: _title.text,
                      untitled: l10n.documentsUntitled,
                      editedAt: editedAt,
                      locale: l10n.localeName,
                    )
                  : l10n.documentsTitle,
              titleActionToken: (widget.documentId, ready),
              showLeadingBrand: false,
              onTitleSubmitted: ready ? _rename : null,
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
                            editor: _editor,
                            focusNode: _editorFocus,
                            scrollController: _editorScroll,
                            status: _status,
                            owner: documentOwnerLabel(document, l10n),
                            lastEdited: edited,
                            onLink: () => unawaited(_editLink()),
                            onHighlight: () => unawaited(
                              _pickColor(DocumentColorChannel.highlight),
                            ),
                            onEditImage: (offset, node) =>
                                unawaited(_editImage(offset, node)),
                            onOpenLink:
                                widget.linkOpener ?? defaultDocumentLinkOpener,
                            onEditTable: (offset, node) => unawaited(
                              editDocumentTable(context, _editor, offset, node),
                            ),
                          ),
                  ),
                ),
                if (ready)
                  Padding(
                    padding: EdgeInsets.only(bottom: lift),
                    child: DocumentFormatToolbar(
                      groups: documentFormatGroups(
                        context: context,
                        editor: _editor,
                        onLink: () => unawaited(_editLink()),
                        onColor: (channel) => unawaited(_pickColor(channel)),
                        onInsert: _insert,
                        camera: documentCameraAvailable,
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
