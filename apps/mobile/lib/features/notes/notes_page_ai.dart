part of 'notes_page.dart';

extension NotesPageAi on NotesPageState {
  NotesAiSnapshot? _aiSnapshot() {
    final note = _selected;
    final actor = widget.localAiActor == null
        ? currentCacheUserId()
        : widget.localAiActor!();
    final workspace = _wsId;
    if (!mounted ||
        actor == null ||
        workspace == null ||
        workspace != _selectedWsId ||
        note == null ||
        note.locked ||
        note.archived) {
      return null;
    }
    return (
      actor: actor,
      workspace: workspace,
      note: note.id,
      selection: _selectionVersion,
      revision: _editRevision,
      document: jsonEncode(_editor.document.toDelta().toJson()),
      title: _title.text,
    );
  }

  Future<bool> _appendAiSummary(
    NotesAiSnapshot receipt,
    String output,
    bool Function() sessionCurrent,
  ) async {
    if (output.trim().isEmpty || output.length > 8000) return false;
    if (!(await _saveQueue)) return false;
    if (!sessionCurrent() || receipt != _aiSnapshot()) return false;
    // Plain text appended at the document end preserves all rich-text nodes.
    _saveTimer?.cancel();
    _initializingEditor = true;
    try {
      final offset = _editor.document.length - 1;
      _editor.replaceText(offset, 0, '\n${output.trim()}\n', null);
      _lastDocument = jsonEncode(_editor.document.toDelta().toJson());
      _lastTitle = _title.text;
      _dirty = true;
      _editRevision++;
    } finally {
      _initializingEditor = false;
    }
    final appended = _aiSnapshot();
    bool current() =>
        sessionCurrent() && appended != null && appended == _aiSnapshot();
    return await _save(admission: current);
  }

  Widget _localAiEditor() => NotesLocalAiHost(
    snapshot: _aiSnapshot,
    createCubit: widget.localAiFactory,
    authEvents: widget.localAiAuthEvents,
    content: () => _editor.document.toPlainText(),
    changes: Listenable.merge([_editor, _title]),
    onAppend: _appendAiSummary,
    child: NoteEditor(
      editor: _editor,
      editing: _editing,
      saving: _saving,
      onInsertLink: _insertLink,
      onOpenLink: (href) => unawaited(_openLink(href)),
      onOpenMention: (target) => unawaited(_openMention(target)),
      onConvertToTask: () => unawaited(_convertChecklistToTask()),
    ),
  );
}
