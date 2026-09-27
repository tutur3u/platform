part of 'notes_page.dart';

extension NotesPageLock on NotesPageState {
  Future<void> _clearUnlockedNoteOnBackground() async {
    if (!(await _save()) || !mounted || _selected?.locked != true) return;
    _initializingEditor = true;
    _editor.document = tipTapJsonToQuillDocument(
      jsonEncode({'type': 'doc', 'content': <Object>[]}),
    );
    _initializingEditor = false;
    _updateState(() {
      _selected = null;
      _selectedPassphrase = null;
      _editing = false;
    });
  }

  Future<void> _lock() async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null || note.locked || !(await _save())) return;
    if (!mounted) return;
    final passphrase = await showNotePassphraseSheet(context, create: true);
    if (passphrase == null || !mounted || _selected?.id != note.id) return;
    try {
      final encoded = quillDocumentToTipTapJson(_editor.document);
      final document = encoded == null
          ? <String, dynamic>{'type': 'doc', 'content': <Object>[]}
          : (jsonDecode(encoded) as Map).cast<String, dynamic>();
      final encrypted = await encryptNoteDocument(document, passphrase);
      final saved = await _repository.update(wsId, note, content: encrypted);
      if (!mounted || _selected?.id != note.id) return;
      _updateState(() {
        _notes = [
          for (final item in _notes)
            if (item.id == saved.id) saved else item,
        ];
        _selected = null;
        _selectedPassphrase = null;
        _editing = false;
        _dirty = false;
        _error = null;
      });
      _initializingEditor = true;
      _editor.document = tipTapJsonToQuillDocument(
        jsonEncode({'type': 'doc', 'content': <Object>[]}),
      );
      _initializingEditor = false;
    } on Object {
      if (mounted) _updateState(() => _error = context.l10n.notesSaveError);
    }
  }

  Future<void> _removeLock() async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null || !note.locked || !(await _save())) {
      return;
    }
    final encoded = quillDocumentToTipTapJson(_editor.document);
    final document = encoded == null
        ? <String, dynamic>{'type': 'doc', 'content': <Object>[]}
        : (jsonDecode(encoded) as Map).cast<String, dynamic>();
    try {
      final saved = await _repository.update(wsId, note, content: document);
      if (!mounted || _selected?.id != note.id) return;
      _updateState(() {
        _selected = saved;
        _selectedPassphrase = null;
        _notes = [
          for (final item in _notes)
            if (item.id == saved.id) saved else item,
        ];
        _error = null;
      });
    } on Object {
      if (mounted) _updateState(() => _error = context.l10n.notesSaveError);
    }
  }
}
