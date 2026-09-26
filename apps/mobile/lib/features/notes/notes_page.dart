import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/notes/note_link_picker_sheet.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:url_launcher/url_launcher.dart';

class NotesPage extends StatefulWidget {
  const NotesPage({super.key, this.repository});

  final NoteRepository? repository;

  @override
  State<NotesPage> createState() => NotesPageState();
}

final notesPageKey = GlobalKey<NotesPageState>();

class NotesPageState extends State<NotesPage> with WidgetsBindingObserver {
  late final NoteRepository _repository = widget.repository ?? NoteRepository();
  final _title = TextEditingController();
  final _search = TextEditingController();
  final _editor = QuillController.basic();
  Timer? _saveTimer;
  Future<bool> _saveQueue = Future<bool>.value(true);
  List<NoteRecord> _notes = const [];
  NoteRecord? _selected;
  String? _selectedWsId;
  String? _error;
  bool _loading = false;
  bool _saving = false;
  bool _initializingEditor = false;
  bool _dirty = false;
  String _lastTitle = '';
  String _lastDocument = '';
  int _editRevision = 0;
  int _queuedRevision = -1;
  int _requestVersion = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _title.addListener(_scheduleSave);
    _editor.addListener(_scheduleSave);
    _search.addListener(() => setState(() {}));
    unawaited(Future<void>.delayed(Duration.zero, _load));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(_save());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _saveTimer?.cancel();
    _title.dispose();
    _search.dispose();
    _editor.dispose();
    if (widget.repository == null) {
      unawaited(_saveQueue.then((_) => _repository.dispose()));
    }
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final version = ++_requestVersion;
    final cached = await _repository.cached(wsId);
    if (!mounted || version != _requestVersion) return;
    setState(() {
      _notes = cached;
      _loading = cached.isEmpty;
    });
    await _refresh(version: version);
  }

  Future<void> _refresh({int? version}) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final requestVersion = version ?? ++_requestVersion;
    try {
      final fresh = await _repository.refresh(wsId);
      if (!mounted || requestVersion != _requestVersion) return;
      setState(() {
        _notes = fresh;
        _error = null;
      });
    } on Object {
      if (mounted && requestVersion == _requestVersion && _notes.isEmpty) {
        setState(() => _error = context.l10n.notesLoadError);
      }
    } finally {
      if (mounted && requestVersion == _requestVersion) {
        setState(() => _loading = false);
      }
    }
  }

  void _select(NoteRecord note) {
    _saveTimer?.cancel();
    _initializingEditor = true;
    _title.text = note.title;
    _editor.document = tipTapJsonToQuillDocument(jsonEncode(note.content));
    _lastTitle = _title.text;
    _lastDocument = jsonEncode(_editor.document.toDelta().toJson());
    _initializingEditor = false;
    setState(() {
      _selected = note;
      _selectedWsId = _wsId;
      _dirty = false;
    });
  }

  void _scheduleSave() {
    if (_initializingEditor || _selected == null) return;
    final nextTitle = _title.text;
    final nextDocument = jsonEncode(_editor.document.toDelta().toJson());
    if (nextTitle == _lastTitle && nextDocument == _lastDocument) return;
    _lastTitle = nextTitle;
    _lastDocument = nextDocument;
    _dirty = true;
    _editRevision++;
    _armSaveTimer();
  }

  void _armSaveTimer() {
    _saveTimer?.cancel();
    _saveTimer = Timer(
      const Duration(milliseconds: 700),
      () => unawaited(_save()),
    );
  }

  Future<bool> _save() {
    _saveTimer?.cancel();
    final wsId = _selectedWsId;
    final note = _selected;
    if (!_dirty || wsId == null || note == null) return _saveQueue;
    if (_queuedRevision == _editRevision) return _saveQueue;
    final encoded = quillDocumentToTipTapJson(_editor.document);
    final content = encoded == null
        ? <String, dynamic>{'type': 'doc', 'content': <Object>[]}
        : (jsonDecode(encoded) as Map).cast<String, dynamic>();
    final title = _title.text.trim();
    final revision = _editRevision;
    _queuedRevision = revision;
    final next = _saveQueue.then(
      (_) => _performSave(wsId, note, title, content, revision),
    );
    _saveQueue = next.catchError((Object _) => false);
    return next;
  }

  Future<bool> _performSave(
    String wsId,
    NoteRecord note,
    String title,
    Map<String, dynamic> content,
    int revision,
  ) async {
    if (title == note.title &&
        jsonEncode(content) == jsonEncode(note.content)) {
      if (mounted &&
          _selectedWsId == wsId &&
          _selected?.id == note.id &&
          _editRevision == revision) {
        _dirty = false;
      }
      return true;
    }
    if (mounted && _selectedWsId == wsId && _selected?.id == note.id) {
      setState(() => _saving = true);
    }
    var savedSuccessfully = false;
    try {
      final saved = await _repository.update(
        wsId,
        note,
        title: title,
        content: content,
      );
      if (mounted &&
          _wsId == wsId &&
          _selectedWsId == wsId &&
          _selected?.id == note.id) {
        setState(() {
          _selected = saved;
          _notes = [
            for (final item in _notes)
              if (item.id == saved.id) saved else item,
          ];
          if (_editRevision == revision) _dirty = false;
          _error = null;
        });
      }
      savedSuccessfully = true;
      return true;
    } on Object {
      if (_queuedRevision == revision) _queuedRevision = -1;
      if (mounted &&
          _wsId == wsId &&
          _selectedWsId == wsId &&
          _selected?.id == note.id) {
        setState(() => _error = context.l10n.notesSaveError);
      }
      return false;
    } finally {
      if (mounted &&
          _wsId == wsId &&
          _selectedWsId == wsId &&
          _selected?.id == note.id) {
        setState(() => _saving = false);
        if (savedSuccessfully && _dirty && _editRevision != revision) {
          _armSaveTimer();
        }
      }
    }
  }

  Future<bool> savePending() => _save();

  Future<void> _create() async {
    final wsId = _wsId;
    if (wsId == null) return;
    if (!(await _save())) return;
    try {
      final note = await _repository.create(wsId);
      if (!mounted || _wsId != wsId) return;
      setState(() => _notes = [note, ..._notes]);
      _select(note);
      unawaited(_refresh());
    } on Object {
      if (mounted) setState(() => _error = context.l10n.notesSaveError);
    }
  }

  Future<void> _archive() async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null) return;
    if (!(await _save())) return;
    try {
      await _repository.update(wsId, note, archived: true);
      if (!mounted || _wsId != wsId || _selected?.id != note.id) return;
      setState(() {
        _notes = _notes.where((item) => item.id != note.id).toList();
        _selected = null;
      });
      unawaited(_refresh());
    } on Object {
      if (mounted) setState(() => _error = context.l10n.notesSaveError);
    }
  }

  Future<void> _insertLink() async {
    final wsId = _wsId;
    final label = TextEditingController();
    final url = TextEditingController();
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.l10n.notesInsertLink,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            if (wsId != null) ...[
              OutlinedButton.icon(
                onPressed: () async {
                  final option = await showNoteLinkPickerSheet(
                    sheetContext,
                    wsId: wsId,
                  );
                  if (option == null) return;
                  label.text = option.title;
                  url.text = option.url;
                },
                icon: const Icon(Icons.search_rounded),
                label: Text(context.l10n.notesLinkWork),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: label,
              decoration: InputDecoration(
                labelText: context.l10n.notesLinkText,
              ),
            ),
            TextField(
              controller: url,
              decoration: InputDecoration(labelText: context.l10n.notesLinkUrl),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: Text(context.l10n.notesInsertButton),
            ),
          ],
        ),
      ),
    );
    if (result == true) {
      final uri = Uri.tryParse(url.text.trim());
      if (uri != null && ['https', 'http'].contains(uri.scheme)) {
        final selection = _editor.selection;
        if (!selection.isCollapsed) {
          _editor.formatSelection(LinkAttribute(uri.toString()));
        } else {
          final text = label.text.trim().isEmpty
              ? url.text.trim()
              : label.text.trim();
          final index = selection.baseOffset.clamp(
            0,
            _editor.document.length - 1,
          );
          _editor
            ..replaceText(
              index,
              0,
              text,
              TextSelection.collapsed(offset: index + text.length),
            )
            ..formatText(index, text.length, LinkAttribute(uri.toString()));
        }
      }
    }
    label.dispose();
    url.dispose();
  }

  Future<void> _openLink(String href) async {
    final uri = Uri.tryParse(href);
    if (uri == null || !['https', 'http'].contains(uri.scheme)) return;
    final parts = uri.pathSegments;
    final wsId = _wsId;
    if (wsId != null && parts.length >= 2 && parts[1] == wsId) {
      if (uri.host == 'tasks.tuturuuu.com' &&
          parts.length == 4 &&
          parts[2] == 'tasks') {
        await context.push<void>('/tasks/${parts[3]}');
        return;
      }
      if (uri.host == 'calendar.tuturuuu.com') {
        final eventId = uri.queryParameters['eventId'];
        if (eventId != null && eventId.isNotEmpty) {
          await context.push<void>('/calendar/$eventId');
          return;
        }
      }
      if (uri.host == 'meet.tuturuuu.com' &&
          parts.length == 4 &&
          parts[2] == 'meetings') {
        await context.push<void>('/meet?room=${parts[3]}');
        return;
      }
    }
    await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
  }

  @override
  Widget build(BuildContext context) {
    final wsId = _wsId;
    final compact = context.isCompact;
    final visible = _notes
        .where(
          (note) => '${note.title} ${note.preview}'.toLowerCase().contains(
            _search.text.toLowerCase(),
          ),
        )
        .toList();
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
      listener: (context, state) async {
        final nextWsId = state.currentWorkspace?.id;
        _requestVersion++;
        if (!(await _save()) || !mounted || _wsId != nextWsId) return;
        setState(() {
          _selected = null;
          _selectedWsId = null;
          _dirty = false;
          _notes = const [];
        });
        unawaited(_load());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'notes-nav',
              locations: const {Routes.notes},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'notes-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () async {
                    if (compact && _selected != null) {
                      if (!(await _save())) return;
                      if (mounted) setState(() => _selected = null);
                    } else {
                      if (!(await _save())) return;
                      if (context.mounted) context.go(Routes.apps);
                    }
                  },
                ),
                ShellMiniNavItemSpec(
                  id: 'notes-home',
                  icon: Icons.note_alt_outlined,
                  label: context.l10n.notesTitle,
                  callbackToken: true,
                  selected: true,
                  onPressed: () {},
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'notes-actions',
              locations: const {Routes.notes},
              actions: [
                ShellActionSpec(
                  id: 'notes-new',
                  icon: Icons.add_rounded,
                  tooltip: context.l10n.notesNew,
                  callbackToken: wsId,
                  enabled: wsId != null,
                  onPressed: _create,
                ),
                if (_selected != null)
                  ShellActionSpec(
                    id: 'notes-archive',
                    icon: Icons.archive_outlined,
                    tooltip: context.l10n.notesArchive,
                    callbackToken: _selected?.id,
                    onPressed: _archive,
                  ),
              ],
            ),
            ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  32 + MediaQuery.paddingOf(context).bottom,
                ),
                child: Column(
                  children: [
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                    Expanded(
                      child: Row(
                        children: [
                          if (!compact || _selected == null)
                            Expanded(
                              flex: compact ? 1 : 2,
                              child: Column(
                                children: [
                                  TextField(
                                    controller: _search,
                                    decoration: InputDecoration(
                                      hintText: context.l10n.notesSearch,
                                      prefixIcon: const Icon(
                                        Icons.search_rounded,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Expanded(
                                    child: _loading && _notes.isEmpty
                                        ? const Center(
                                            child: NovaLoadingIndicator(),
                                          )
                                        : RefreshIndicator(
                                            onRefresh: _refresh,
                                            child: ListView.builder(
                                              itemCount: visible.isEmpty
                                                  ? 1
                                                  : visible.length,
                                              itemBuilder: (context, index) {
                                                if (visible.isEmpty) {
                                                  return Padding(
                                                    padding:
                                                        const EdgeInsets.all(
                                                          24,
                                                        ),
                                                    child: Text(
                                                      context.l10n.notesEmpty,
                                                    ),
                                                  );
                                                }
                                                final note = visible[index];
                                                return ListTile(
                                                  selected:
                                                      note.id == _selected?.id,
                                                  title: Text(
                                                    note.title.isEmpty
                                                        ? context
                                                              .l10n
                                                              .notesUntitled
                                                        : note.title,
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                  subtitle: Text(
                                                    note.preview,
                                                    maxLines: 2,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                  onTap: () async {
                                                    if (!(await _save())) {
                                                      return;
                                                    }
                                                    if (mounted) {
                                                      final current = _notes
                                                          .where(
                                                            (item) =>
                                                                item.id ==
                                                                note.id,
                                                          )
                                                          .firstOrNull;
                                                      _select(current ?? note);
                                                    }
                                                  },
                                                );
                                              },
                                            ),
                                          ),
                                  ),
                                ],
                              ),
                            ),
                          if (!compact) const VerticalDivider(width: 24),
                          if (!compact || _selected != null)
                            Expanded(
                              flex: compact ? 1 : 5,
                              child: _selected == null
                                  ? Center(child: Text(context.l10n.notesEmpty))
                                  : _NoteEditor(
                                      title: _title,
                                      editor: _editor,
                                      saving: _saving,
                                      onInsertLink: _insertLink,
                                      onOpenLink: (href) =>
                                          unawaited(_openLink(href)),
                                    ),
                            ),
                        ],
                      ),
                    ),
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

class _NoteEditor extends StatelessWidget {
  const _NoteEditor({
    required this.title,
    required this.editor,
    required this.saving,
    required this.onInsertLink,
    required this.onOpenLink,
  });
  final TextEditingController title;
  final QuillController editor;
  final bool saving;
  final VoidCallback onInsertLink;
  final ValueChanged<String> onOpenLink;

  @override
  Widget build(BuildContext context) => Localizations.override(
    context: context,
    delegates: const [FlutterQuillLocalizations.delegate],
    child: Column(
      children: [
        TextField(
          controller: title,
          style: Theme.of(context).textTheme.headlineSmall,
          decoration: InputDecoration(
            hintText: context.l10n.notesUntitled,
            border: InputBorder.none,
          ),
        ),
        Row(
          children: [
            for (final action in <(Attribute<dynamic>, IconData)>[
              (Attribute.bold, Icons.format_bold),
              (Attribute.italic, Icons.format_italic),
              (Attribute.ul, Icons.format_list_bulleted),
              (Attribute.ol, Icons.format_list_numbered),
            ])
              IconButton(
                icon: Icon(action.$2),
                onPressed: () => editor.formatSelection(action.$1),
              ),
            IconButton(
              tooltip: context.l10n.notesInsertLink,
              icon: const Icon(Icons.link_rounded),
              onPressed: onInsertLink,
            ),
            const Spacer(),
            if (saving)
              const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          child: QuillEditor.basic(
            controller: editor,
            config: QuillEditorConfig(
              placeholder: context.l10n.notesStartWriting,
              padding: const EdgeInsets.symmetric(vertical: 16),
              onLaunchUrl: onOpenLink,
            ),
          ),
        ),
      ],
    ),
  );
}
