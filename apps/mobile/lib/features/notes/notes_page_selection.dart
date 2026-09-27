part of 'notes_page.dart';

extension NotesPageSelection on NotesPageState {
  Future<void> _select(NoteRecord note) async {
    final selectionVersion = ++_selectionVersion;
    final wsId = _wsId;
    var document = note.content;
    String? passphrase;
    final unlockReason = context.l10n.notesDeviceUnlockReason;
    if (note.locked) {
      if (isDeviceLockedNote(note.content)) {
        if (wsId == null) return;
        final lockId = lockedNoteEnvelope(note.content)?['lockId'] as String?;
        final method = await _deviceLock.method(wsId, note.id, lockId: lockId);
        if (!mounted || selectionVersion != _selectionVersion) return;
        if (method == null) {
          try {
            final accountId = supabase.auth.currentUser?.id;
            if (accountId == null) return;
            final priorSession = supabase.auth.currentSession;
            final response = await supabase.auth.signInWithPasskey(
              PasskeyAuthenticator(),
            );
            if (response.user?.id != accountId) {
              var restoredOwner = false;
              if (priorSession?.refreshToken != null) {
                try {
                  final restored = await supabase.auth.setSession(
                    priorSession!.refreshToken!,
                    accessToken: priorSession.accessToken,
                  );
                  restoredOwner = restored.user?.id == accountId;
                } on Object {
                  // A revoked session cannot restore the previous account.
                }
              }
              if (!restoredOwner) await supabase.auth.signOut();
              throw StateError('Passkey account mismatch');
            }
            passphrase = await _repository.recoverKeyWithPasskey(wsId, note.id);
          } on Object {
            if (mounted && selectionVersion == _selectionVersion) {
              _updateState(
                () => _error = context.l10n.notesPasskeyUnlockFailed,
              );
            }
            return;
          }
          if (!mounted || selectionVersion != _selectionVersion) return;
        } else {
          String? pin;
          if (method == NoteDeviceLockMethod.pin) {
            pin = await showNotePinSheet(
              context,
              onSheetContext: (value) => _activeSheetContext = value,
              onDismissed: _returnToNotesListIfBackRequested,
            );
            if (pin == null) return;
          }
          passphrase = await _deviceLock.unlock(
            wsId,
            note.id,
            lockId: lockId,
            pin: pin,
            reason: unlockReason,
          );
          if (passphrase == null) {
            if (pin != null &&
                mounted &&
                selectionVersion == _selectionVersion) {
              _updateState(() => _error = context.l10n.notesIncorrectPin);
            }
            return;
          }
        }
      } else {
        passphrase = await showNotePassphraseSheet(
          context,
          create: false,
          onSheetContext: (value) => _activeSheetContext = value,
          onDismissed: _returnToNotesListIfBackRequested,
        );
      }
      if (passphrase == null ||
          !mounted ||
          selectionVersion != _selectionVersion ||
          _wsId != wsId) {
        return;
      }
      try {
        document = await decryptNoteDocument(note.content, passphrase);
      } on Object {
        if (mounted && selectionVersion == _selectionVersion && _wsId == wsId) {
          _updateState(() => _error = context.l10n.notesIncorrectPassphrase);
        }
        return;
      }
    }
    if (!mounted || selectionVersion != _selectionVersion || _wsId != wsId) {
      return;
    }
    _saveTimer?.cancel();
    _initializingEditor = true;
    _title.text = note.title;
    _editor.document = tipTapJsonToQuillDocument(jsonEncode(document));
    _lastTitle = _title.text;
    _lastDocument = jsonEncode(_editor.document.toDelta().toJson());
    _initializingEditor = false;
    _updateState(() {
      _selected = note;
      _selectedPassphrase = passphrase;
      _selectedWsId = wsId;
      _error = null;
      _dirty = false;
      _editing = false;
      _editor.readOnly = true;
    });
  }
}
