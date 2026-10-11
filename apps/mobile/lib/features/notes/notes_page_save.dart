part of 'notes_page.dart';

extension NotesPageSave on NotesPageState {
  Future<bool> _save({bool Function()? admission}) async {
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
        if (mounted) _updateState(() => _error = context.l10n.notesSaveError);
        return false;
      }
    }
    final next = _saveQueue.then(
      (_) => _performSave(wsId, note, title, content, revision, admission),
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
    bool Function()? admission,
  ) async {
    if (admission != null && !admission()) {
      if (_queuedRevision == revision) _queuedRevision = -1;
      return false;
    }
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
      _updateState(() => _saving = true);
    }
    var savedSuccessfully = false;
    try {
      final saved = await _repository.update(
        wsId,
        note,
        title: title,
        content: content,
      );
      // A dispatched update may already have been accepted remotely. Its late
      // response does not authorize reconciling a superseded local AI review.
      if (admission != null && !admission()) {
        if (_queuedRevision == revision) _queuedRevision = -1;
        return false;
      }
      if (mounted &&
          _wsId == wsId &&
          _selectedWsId == wsId &&
          _selected?.id == note.id) {
        _updateState(() {
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
        _updateState(() => _error = context.l10n.notesSaveError);
      }
      return false;
    } finally {
      if (mounted &&
          _wsId == wsId &&
          _selectedWsId == wsId &&
          _selected?.id == note.id) {
        _updateState(() => _saving = false);
        if (savedSuccessfully && _dirty && _editRevision != revision) {
          _armSaveTimer();
        }
      }
    }
  }
}
