part of 'notes_page.dart';

extension NotesPageLinks on NotesPageState {
  Future<void> _openMention(NoteMentionTarget target) async {
    final wsId = _wsId;
    if (wsId == null || target.workspaceId != wsId) return;
    if (target.kind == 'note') {
      final candidates = [
        ..._notes,
        ...await _repository.cached(wsId),
        ...await _repository.cached(wsId, archived: true),
      ];
      var note = candidates.where((item) => item.id == target.id).firstOrNull;
      if (note == null) {
        try {
          final fetched = await Future.wait([
            _repository.refresh(wsId),
            _repository.refresh(wsId, archived: true),
          ]);
          note = fetched
              .expand((items) => items)
              .where((item) => item.id == target.id)
              .firstOrNull;
        } on Object {
          return;
        }
      }
      if (note == null || !mounted || _wsId != wsId) return;
      await _switchTab(note.archived ? NotesTab.archive : NotesTab.inbox);
      if (mounted && _wsId == wsId) await _select(note);
      return;
    }
    if (!mounted || _wsId != wsId) return;
    var resolvedId = target.id;
    final userId = currentCacheUserId();
    if (userId != null) {
      final ids = await CacheStore.instance.localIdMappingsForScope(
        userId: userId,
        workspaceId: wsId,
      );
      resolvedId = ids[target.id] ?? target.id;
    }
    if (resolvedId == target.id &&
        OfflineMutationQueue.instance.pending.value.any(
          (edit) => edit.workspaceId == wsId && edit.entityId == target.id,
        )) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (context, overlay) =>
            shad.SurfaceCard(child: Text(context.l10n.offlineEditQueued)),
      );
      return;
    }
    if (!mounted || _wsId != wsId) return;
    final route = switch (target.kind) {
      'task' => '/tasks/$resolvedId',
      'event' => '/calendar/$resolvedId',
      'finance' => '/finance/wallets/$resolvedId',
      'meeting' => '/meet?room=$resolvedId',
      _ => null,
    };
    if (route != null) await context.push<void>(route);
  }

  Future<void> _insertLink() async {
    final wsId = _wsId;
    final label = TextEditingController();
    final url = TextEditingController();
    NoteLinkOption? linkedRecord;
    final result = await _showNotesSheet<bool>(
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
                  linkedRecord = option;
                  label.text = option.title;
                  url.text = option.url;
                  if (sheetContext.mounted) {
                    Navigator.of(sheetContext).pop(true);
                  }
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
      final record = linkedRecord;
      if (record != null && wsId != null) {
        final selection = _editor.selection;
        final index = selection.baseOffset.clamp(
          0,
          _editor.document.length - 1,
        );
        _editor.replaceText(
          index,
          selection.isCollapsed ? 0 : selection.end - selection.start,
          Embeddable(
            'mention',
            jsonEncode({
              'entityId': record.id,
              'entityType': record.kind.name,
              'displayName': record.title,
              'workspaceId': wsId,
            }),
          ),
          TextSelection.collapsed(offset: index + 1),
        );
      } else {
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
    }
    label.dispose();
    url.dispose();
  }

  Future<void> _openLink(String href) async {
    final uri = Uri.tryParse(href);
    if (uri == null || !['https', 'http'].contains(uri.scheme)) return;
    final shouldOpen = await _chooseLinkAction(href);
    if (!shouldOpen || !mounted) return;
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

  Future<bool> _chooseLinkAction(String href) async {
    var offset = 0;
    var linkStart = -1;
    var linkLength = 0;
    var linkText = '';
    for (final operation in _editor.document.toDelta().toList()) {
      final data = operation.data;
      if (data is! String) continue;
      if (operation.attributes?['link'] == href) {
        final selection = _editor.selection.baseOffset;
        if (linkStart < 0 ||
            (selection >= offset && selection < offset + data.length)) {
          linkStart = offset;
          linkLength = data.length;
          linkText = data;
        }
      }
      offset += data.length;
    }
    final label = TextEditingController(text: linkText);
    final url = TextEditingController(text: href);
    final choice = await _showNotesSheet<String>(
      maxDialogWidth: 440,
      builder: (sheetContext) => AppDialogScaffold(
        title: sheetContext.l10n.notesEditLink,
        icon: Icons.link_rounded,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: label,
                decoration: InputDecoration(
                  labelText: sheetContext.l10n.notesLinkText,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: url,
                keyboardType: TextInputType.url,
                decoration: InputDecoration(
                  labelText: sheetContext.l10n.notesLinkUrl,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () => Navigator.of(sheetContext).pop('open'),
                    icon: const Icon(Icons.open_in_new_rounded),
                    label: Text(sheetContext.l10n.notesOpenLink),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: linkStart < 0
                        ? null
                        : () => Navigator.of(sheetContext).pop('save'),
                    child: Text(sheetContext.l10n.notesSaveLink),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == 'save' && mounted && linkStart >= 0) {
      final nextUri = Uri.tryParse(url.text.trim());
      if (nextUri != null && ['https', 'http'].contains(nextUri.scheme)) {
        final nextLabel = label.text.trim().isEmpty
            ? nextUri.toString()
            : label.text.trim();
        final wasReadOnly = _editor.readOnly;
        _editor.readOnly = false;
        _editor
          ..replaceText(
            linkStart,
            linkLength,
            nextLabel,
            TextSelection.collapsed(offset: linkStart + nextLabel.length),
          )
          ..formatText(
            linkStart,
            nextLabel.length,
            LinkAttribute(nextUri.toString()),
          )
          ..readOnly = wasReadOnly;
        unawaited(_save());
      }
    }
    label.dispose();
    url.dispose();
    return choice == 'open';
  }
}
