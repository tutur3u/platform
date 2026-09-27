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
      _selectedWsId = null;
      _editing = false;
    });
  }

  Future<void> _lock() async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null || note.locked || !(await _save())) return;
    if (!mounted) return;
    final deviceAvailable = await _deviceLock.canAuthenticate();
    if (!mounted || _selected?.id != note.id) return;
    final choice = await showNoteLockSheet(
      context,
      deviceAvailable: deviceAvailable,
      onSheetContext: (value) => _activeSheetContext = value,
      onDismissed: _returnToNotesList,
    );
    if (choice == null || !mounted || _selected?.id != note.id) return;
    final deviceOnly = choice.method != NoteLockMethod.passphrase;
    if (choice.method == NoteLockMethod.device &&
        !await _deviceLock.authenticate(
          reason: context.l10n.notesDeviceUnlockReason,
        )) {
      return;
    }
    if (!mounted || _selected?.id != note.id || _wsId != wsId) return;
    final secret = deviceOnly ? _deviceLock.createSecret() : choice.secret!;
    final lockId = deviceOnly ? _deviceLock.createLockId() : null;
    try {
      if (deviceOnly) {
        await _deviceLock.save(
          wsId,
          note.id,
          secret,
          lockId: lockId!,
          pin: choice.method == NoteLockMethod.pin ? choice.secret : null,
        );
      }
      final encoded = quillDocumentToTipTapJson(_editor.document);
      final document = encoded == null
          ? <String, dynamic>{'type': 'doc', 'content': <Object>[]}
          : (jsonDecode(encoded) as Map).cast<String, dynamic>();
      final encrypted = await encryptNoteDocument(
        document,
        secret,
        deviceOnly: deviceOnly,
        lockId: lockId,
        recovery: deviceOnly
            ? await _repository.wrapRecoveryKey(wsId, note.id, secret)
            : null,
      );
      final saved = await _repository.update(wsId, note, content: encrypted);
      if (!mounted || _selected?.id != note.id) return;
      _updateState(() {
        _notes = [
          for (final item in _notes)
            if (item.id == saved.id) saved else item,
        ];
        _selected = null;
        _selectedPassphrase = null;
        _selectedWsId = null;
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
      if (isDeviceLockedNote(note.content)) {
        await _deviceLock.delete(wsId, note.id);
      }
    } on Object {
      if (mounted) _updateState(() => _error = context.l10n.notesSaveError);
    }
  }
}
