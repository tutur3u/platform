import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/notes/note_checklist_selection.dart';
import 'package:mobile/features/notes/note_device_lock.dart';
import 'package:mobile/features/notes/note_editor.dart';
import 'package:mobile/features/notes/note_link_picker_sheet.dart';
import 'package:mobile/features/notes/note_list.dart';
import 'package:mobile/features/notes/note_lock_crypto.dart';
import 'package:mobile/features/notes/note_mention_embed_builder.dart';
import 'package:mobile/features/notes/note_passphrase_sheet.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/note_task_conversion_sheet.dart';
import 'package:mobile/features/notes/note_transfer_sheet.dart';
import 'package:mobile/features/notes/voice/notes_voice_host.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:passkeys/authenticator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

part 'notes_page_links.dart';
part 'notes_page_lock.dart';
part 'notes_page_selection.dart';
part 'notes_page_actions.dart';
part 'notes_page_tasks.dart';

enum NotesTab { inbox, archive }

class NotesPage extends StatefulWidget {
  const NotesPage({super.key, this.repository});

  final NoteRepository? repository;

  @override
  State<NotesPage> createState() => NotesPageState();
}

final notesPageKey = GlobalKey<NotesPageState>();

class NotesPageState extends State<NotesPage> with WidgetsBindingObserver {
  late final NoteRepository _repository = widget.repository ?? NoteRepository();
  final _deviceLock = NoteDeviceLockService();
  final _title = TextEditingController();
  final _search = TextEditingController();
  final _editor = QuillController.basic();
  Timer? _saveTimer;
  Future<bool> _saveQueue = Future<bool>.value(true);
  List<NoteRecord> _notes = const [];
  NotesTab _tab = NotesTab.inbox;
  NoteRecord? _selected;
  String? _selectedWsId;
  String? _selectedPassphrase;
  String? _error;
  bool _loading = false;
  bool _saving = false;
  bool _initializingEditor = false;
  bool _dirty = false;
  bool _editing = false;
  bool _searching = false;
  String _lastTitle = '';
  String _lastDocument = '';
  int _editRevision = 0;
  int _queuedRevision = -1;
  int _requestVersion = 0;
  int _selectionVersion = 0;
  String? _requestedSelectionId;
  BuildContext? _activeSheetContext;
  bool _backRequestedFromSheet = false;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  void _updateState(VoidCallback change) => setState(change);

  Future<T?> _showNotesSheet<T>({
    required Widget Function(BuildContext) builder,
    double maxDialogWidth = 420,
  }) async {
    final previous = _activeSheetContext;
    try {
      final result = await showAdaptiveSheet<T>(
        context: context,
        maxDialogWidth: maxDialogWidth,
        builder: (sheetContext) {
          _activeSheetContext = sheetContext;
          return builder(sheetContext);
        },
      );
      if (result == null) await _returnToNotesListIfBackRequested();
      return result;
    } finally {
      _backRequestedFromSheet = false;
      _activeSheetContext = previous;
    }
  }

  Future<void> _returnToNotesListIfBackRequested() async {
    if (!_backRequestedFromSheet) return;
    _backRequestedFromSheet = false;
    await _returnToNotesList();
  }

  Future<void> _returnToNotesList() async {
    if (_selected == null || !mounted || !(await _save()) || !mounted) return;
    setState(() {
      _selected = null;
      _selectedPassphrase = null;
      _selectedWsId = null;
      _editing = false;
    });
  }

  Future<void> _goBack() async {
    final sheetContext = _activeSheetContext;
    if (sheetContext != null && sheetContext.mounted) {
      _backRequestedFromSheet = true;
      if (!await Navigator.of(sheetContext).maybePop()) {
        _backRequestedFromSheet = false;
      }
      return;
    }
    if (!mounted || !(await _save())) return;
    if (!mounted) return;
    if (_selected != null) {
      await _returnToNotesList();
    } else {
      context.go(Routes.apps);
    }
  }

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
  void didChangeDependencies() {
    super.didChangeDependencies();
    final noteId = GoRouterState.of(context).uri.queryParameters['noteId'];
    if (noteId == null || noteId == _requestedSelectionId) return;
    _requestedSelectionId = noteId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_openRequestedNote());
    });
  }

  Future<void> _openRequestedNote() async {
    final noteId = _requestedSelectionId;
    if (noteId == null || _selected?.id == noteId) return;
    final note = _notes.where((item) => item.id == noteId).firstOrNull;
    if (note != null) await _select(note);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
    if (state == AppLifecycleState.inactive) {
      unawaited(_save());
    }
    if (state == AppLifecycleState.paused) {
      unawaited(_clearUnlockedNoteOnBackground());
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
    final tab = _tab;
    final cached = await _repository.cached(
      wsId,
      archived: tab == NotesTab.archive,
    );
    if (!mounted || version != _requestVersion || tab != _tab) return;
    setState(() {
      _notes = cached;
      _loading = cached.isEmpty;
    });
    await _openRequestedNote();
    await _refresh(version: version);
  }

  Future<void> _refresh({int? version}) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final requestVersion = version ?? ++_requestVersion;
    final tab = _tab;
    try {
      final fresh = await _repository.refresh(
        wsId,
        archived: tab == NotesTab.archive,
      );
      if (!mounted || requestVersion != _requestVersion || tab != _tab) return;
      setState(() {
        _notes = fresh;
        _error = null;
      });
      await _openRequestedNote();
    } on Object {
      if (mounted &&
          requestVersion == _requestVersion &&
          tab == _tab &&
          _notes.isEmpty) {
        setState(() => _error = context.l10n.notesLoadError);
      }
    } finally {
      if (mounted && requestVersion == _requestVersion && tab == _tab) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _switchTab(NotesTab tab) async {
    if (_tab == tab || !(await _save()) || !mounted) return;
    _selectionVersion++;
    setState(() {
      _tab = tab;
      _selected = null;
      _selectedPassphrase = null;
      _selectedWsId = null;
      _editing = false;
      _searching = false;
      _search.clear();
      _notes = const [];
      _error = null;
    });
    await _load();
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
    if (nextTitle != _selected?.title && mounted) setState(() {});
    _armSaveTimer();
  }

  void _armSaveTimer() {
    _saveTimer?.cancel();
    _saveTimer = Timer(
      const Duration(milliseconds: 700),
      () => unawaited(_save()),
    );
  }

  Future<bool> _save() async {
    _saveTimer?.cancel();
    final wsId = _selectedWsId;
    final note = _selected;
    if (!_dirty || wsId == null || note == null) return await _saveQueue;
    if (_queuedRevision == _editRevision) return await _saveQueue;
    final encoded = quillDocumentToTipTapJson(_editor.document);
    var content = encoded == null
        ? <String, dynamic>{'type': 'doc', 'content': <Object>[]}
        : (jsonDecode(encoded) as Map).cast<String, dynamic>();
    final title = _title.text.trim();
    final revision = _editRevision;
    _queuedRevision = revision;
    if (note.locked) {
      final passphrase = _selectedPassphrase;
      if (passphrase == null) {
        _queuedRevision = -1;
        return false;
      }
      try {
        content = await encryptNoteDocument(
          content,
          passphrase,
          deviceOnly: isDeviceLockedNote(note.content),
          recovery: lockedNoteEnvelope(note.content)?['recovery'] as String?,
          lockId: lockedNoteEnvelope(note.content)?['lockId'] as String?,
        );
      } on Object {
        _queuedRevision = -1;
        if (mounted) setState(() => _error = context.l10n.notesSaveError);
        return false;
      }
    }
    final next = _saveQueue.then(
      (_) => _performSave(wsId, note, title, content, revision),
    );
    _saveQueue = next.catchError((Object _) => false);
    return await next;
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
    if (_tab == NotesTab.archive) {
      await _switchTab(NotesTab.inbox);
      if (!mounted || _tab != NotesTab.inbox) return;
    }
    if (!(await _save())) return;
    try {
      final note = await _repository.create(wsId);
      if (!mounted || _wsId != wsId) return;
      setState(() => _notes = [note, ..._notes]);
      await _select(note);
      if (!mounted) return;
      setState(() {
        _editing = true;
        _editor.readOnly = false;
      });
      unawaited(_refresh());
    } on Object {
      if (mounted) setState(() => _error = context.l10n.notesSaveError);
    }
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
    return NotesVoiceHost(
      enabled: _selected == null && !_searching,
      onSaved: _refresh,
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
        listener: (context, state) async {
          final nextWsId = state.currentWorkspace?.id;
          _requestVersion++;
          _selectionVersion++;
          if (!(await _save()) || !mounted || _wsId != nextWsId) return;
          setState(() {
            _selected = null;
            _selectedPassphrase = null;
            _selectedWsId = null;
            _dirty = false;
            _editing = false;
            _searching = false;
            _search.clear();
            _notes = const [];
          });
          unawaited(_load());
        },
        child: shad.Scaffold(
          child: Stack(
            children: [
              ShellTitleOverride(
                ownerId: 'notes-title',
                locations: const {Routes.notes},
                title: _searching && _selected == null
                    ? context.l10n.notesSearch
                    : _selected == null
                    ? context.l10n.notesTitle
                    : _title.text.trim().isEmpty
                    ? context.l10n.notesUntitled
                    : _title.text.trim(),
                showLeadingBrand: _selected == null && !_searching,
                onTitleSubmitted: _selected == null
                    ? null
                    : (title) async {
                        if (title.trim() == _title.text.trim()) return;
                        _title.text = title.trim();
                        if (!(await _save())) {
                          throw StateError('Could not save note title');
                        }
                      },
              ),
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
                    onPressed: _goBack,
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
                  if (_selected == null) ...[
                    ShellActionSpec(
                      id: 'notes-search',
                      icon: _searching
                          ? Icons.search_off_rounded
                          : Icons.search_rounded,
                      tooltip: context.l10n.notesSearch,
                      inDock: true,
                      callbackToken: _searching,
                      searchController: _searching ? _search : null,
                      searchHint: context.l10n.notesSearch,
                      onSearchChanged: (_) => setState(() {}),
                      onCloseSearch: () => setState(() {
                        _searching = false;
                        _search.clear();
                      }),
                      onPressed: () => setState(() {
                        _searching = !_searching;
                        if (!_searching) _search.clear();
                      }),
                    ),
                    ShellActionSpec(
                      id: 'notes-new',
                      icon: Icons.add_rounded,
                      tooltip: context.l10n.notesNew,
                      inDock: true,
                      callbackToken: wsId,
                      enabled: wsId != null,
                      onPressed: () => unawaited(_create()),
                    ),
                  ] else ...[
                    ShellActionSpec(
                      id: 'notes-edit',
                      icon: _editing
                          ? Icons.check_rounded
                          : Icons.edit_outlined,
                      tooltip: _editing
                          ? context.l10n.notesDone
                          : context.l10n.notesEdit,
                      inDock: true,
                      callbackToken: '${_selected?.id}-$_editing',
                      onPressed: () async {
                        if (_editing && !(await _save())) {
                          return;
                        }
                        if (!mounted) return;
                        setState(() {
                          _editing = !_editing;
                          _editor.readOnly = !_editing;
                        });
                      },
                    ),
                    ShellActionSpec(
                      id: 'notes-more',
                      icon: Icons.more_horiz_rounded,
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).showMenuTooltip,
                      inDock: true,
                      callbackToken: _selected?.id,
                      onPressed: () => unawaited(_showNoteActions()),
                    ),
                  ],
                  if (_selected == null)
                    for (final tab in NotesTab.values)
                      ShellActionSpec(
                        id: 'notes-tab-${tab.name}',
                        segmentGroup: 'notes-tabs',
                        icon: tab == NotesTab.inbox
                            ? Icons.inbox_outlined
                            : Icons.archive_outlined,
                        tooltip: tab == NotesTab.inbox
                            ? context.l10n.notesInbox
                            : context.l10n.notesArchiveTab,
                        highlighted: _tab == tab,
                        callbackToken: _tab,
                        onPressed: () => unawaited(_switchTab(tab)),
                      ),
                ],
              ),
              ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
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
                                    Expanded(
                                      child: _loading && _notes.isEmpty
                                          ? const Center(
                                              child: NovaLoadingIndicator(),
                                            )
                                          : RefreshIndicator(
                                              onRefresh: _refresh,
                                              child: NoteList(
                                                notes: visible,
                                                workspaceId: _wsId ?? '',
                                                archived:
                                                    _tab == NotesTab.archive,
                                                selectedId: _selected?.id,
                                                onSelect: (note) async {
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
                                                    await _select(
                                                      current ?? note,
                                                    );
                                                  }
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
                                    ? Center(
                                        child: Text(context.l10n.notesEmpty),
                                      )
                                    : NoteEditor(
                                        editor: _editor,
                                        editing: _editing,
                                        saving: _saving,
                                        onInsertLink: _insertLink,
                                        onOpenLink: (href) =>
                                            unawaited(_openLink(href)),
                                        onOpenMention: (target) =>
                                            unawaited(_openMention(target)),
                                        onConvertToTask: () => unawaited(
                                          _convertChecklistToTask(),
                                        ),
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
      ),
    );
  }
}
