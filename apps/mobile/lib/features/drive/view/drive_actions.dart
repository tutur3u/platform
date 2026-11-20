part of 'drive_page.dart';

extension _DriveActions on _DrivePageState {
  bool _isDirectoryCurrent(String wsId, String? actorId, String path) =>
      mounted && _wsId == wsId && _actorId == actorId && _path == path;

  Future<void> _showCreateFolderDialog() async {
    final wsId = _wsId;
    final actorId = _actorId;
    final path = _path;
    if (wsId == null) return;
    final l10n = context.l10n;
    var name = '';
    final created = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.driveCreateFolder,
        content: _DriveNameField(
          initialName: name,
          onChanged: (value) => name = value.trim(),
          placeholder: context.l10n.driveFolderName,
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonCreate),
          ),
        ],
      ),
    );

    if (created != true ||
        name.isEmpty ||
        !_isDirectoryCurrent(wsId, actorId, path)) {
      return;
    }

    try {
      await _repository.createFolder(wsId, path: path, name: name);
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _toast(l10n.driveFolderCreated);
      await _reload();
    } on ApiException catch (error) {
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _renameEntry(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final path = _path;
    if (wsId == null) return;
    final l10n = context.l10n;
    var name = entry.name;
    final renamed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.commonRename,
        content: _DriveNameField(
          initialName: name,
          onChanged: (value) => name = value.trim(),
          placeholder: context.l10n.driveRenameHint,
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonSave),
          ),
        ],
      ),
    );

    if (renamed != true ||
        name.isEmpty ||
        !_isDirectoryCurrent(wsId, actorId, path)) {
      return;
    }

    try {
      await _repository.renameEntry(
        wsId,
        path: path,
        currentName: entry.name,
        newName: name,
        isFolder: entry.isFolder,
      );
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _toast(l10n.driveRenameSuccess);
      await _reload();
    } on ApiException catch (error) {
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteEntries(List<DriveEntry> entries) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final path = _path;
    final l10n = context.l10n;
    if (wsId == null) return;
    if (entries.isEmpty) return;

    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.commonDelete,
        content: Text(
          entries.length == 1
              ? context.l10n.driveDeleteSingleConfirm
              : context.l10n.driveDeleteManyConfirm(entries.length),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );

    if (confirmed != true || !_isDirectoryCurrent(wsId, actorId, path)) return;

    try {
      for (final entry in entries) {
        if (!_isDirectoryCurrent(wsId, actorId, path)) return;
        if (entry.isFolder) {
          await _repository.deleteFolder(wsId, path: path, name: entry.name);
        } else {
          final fullPath = path.isEmpty ? entry.name : '$path/${entry.name}';
          await _repository.deleteFile(wsId, path: fullPath);
        }
      }
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _update(_selectedNames.clear);
      _toast(l10n.driveDeleteSuccess);
      await _reload();
    } on ApiException catch (error) {
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      _toast(error.message, destructive: true);
      await _reload();
    }
  }

  Future<void> _uploadFiles() async {
    final wsId = _wsId;
    final actorId = _actorId;
    final path = _path;
    if (wsId == null) return;
    final result = await FilePicker.pickFiles();
    if (result.isEmpty || !_isDirectoryCurrent(wsId, actorId, path)) return;

    for (final file in result) {
      if (!_isDirectoryCurrent(wsId, actorId, path)) return;
      try {
        final bytes = await file.readAsBytes();
        if (!_isDirectoryCurrent(wsId, actorId, path)) return;
        final mimeType =
            lookupMimeType(file.name, headerBytes: bytes.take(12).toList()) ??
            'application/octet-stream';
        final uploadResult = await _repository.uploadBytes(
          wsId,
          directoryPath: path,
          filename: file.name,
          bytes: bytes,
          contentType: mimeType,
        );
        if (!_isDirectoryCurrent(wsId, actorId, path)) return;
        if ((uploadResult.autoExtractMessage ?? '').isNotEmpty) {
          _toast(uploadResult.autoExtractMessage!);
        }
      } on ApiException catch (error) {
        if (!_isDirectoryCurrent(wsId, actorId, path)) return;
        _toast('${file.name}: ${error.message}', destructive: true);
      }
    }

    if (!_isDirectoryCurrent(wsId, actorId, path)) return;
    await _reload();
  }

  Future<void> _showDriveActionsSheet() async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<String>(
      context: context,
      title: l10n.commonCreate,
      actions: [
        AppSheetAction(
          icon: LucideIcons.folderPlus,
          tone: AppTone.info,
          label: l10n.driveCreateFolder,
          value: 'folder',
        ),
        AppSheetAction(
          icon: LucideIcons.upload,
          tone: AppTone.info,
          label: l10n.driveUploadFiles,
          value: 'upload',
        ),
      ],
    );

    if (!mounted || action == null) return;

    switch (action) {
      case 'folder':
        await _showCreateFolderDialog();
      case 'upload':
        await _uploadFiles();
    }
  }

  Future<void> _showSortSheet() async {
    final l10n = context.l10n;
    final action = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.sortBy,
      selected: switch ((_sortBy, _sortOrder)) {
        ('name', 'asc') => 'name_asc',
        ('name', 'desc') => 'name_desc',
        ('updated_at', 'desc') => 'updated_desc',
        ('size', 'desc') => 'size_desc',
        _ => null,
      },
      choices: [
        AppSheetChoice(value: 'name_asc', label: l10n.driveSortNameAsc),
        AppSheetChoice(value: 'name_desc', label: l10n.driveSortNameDesc),
        AppSheetChoice(value: 'updated_desc', label: l10n.driveSortUpdated),
        AppSheetChoice(value: 'size_desc', label: l10n.driveSortSize),
      ],
    );

    if (!mounted || action == null) return;

    _update(() {
      switch (action) {
        case 'name_asc':
          _sortBy = 'name';
          _sortOrder = 'asc';
        case 'name_desc':
          _sortBy = 'name';
          _sortOrder = 'desc';
        case 'updated_desc':
          _sortBy = 'updated_at';
          _sortOrder = 'desc';
        case 'size_desc':
          _sortBy = 'size';
          _sortOrder = 'desc';
      }
    });
    await _reload();
  }

  Future<void> _showStorageUsage() async {
    final l10n = context.l10n;
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    try {
      final usage = await _repository.getAnalytics(wsId);
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      await showAppSheet<void>(
        context: context,
        builder: (context) => AppSheetScaffold(
          title: context.l10n.driveStorageUsage,
          slivers: [SliverToBoxAdapter(child: _DriveUsage(usage: usage))],
        ),
      );
    } on ApiException catch (error) {
      if (_isCurrentRequest(token, wsId, actorId)) {
        _toast(error.message, destructive: true);
      }
    } on Object catch (_) {
      if (_isCurrentRequest(token, wsId, actorId)) {
        _toast(l10n.commonSomethingWentWrong, destructive: true);
      }
    }
  }

  Future<void> _showBreadcrumbs() async {
    final parts = _path.split('/');
    final path = _path;
    final wsId = _wsId;
    final actorId = _actorId;
    final destination = await showAppChoiceSheet<String>(
      context: context,
      title: context.l10n.driveTitle,
      selected: path,
      choices: [
        AppSheetChoice(value: '', label: context.l10n.driveTitle),
        for (var index = 0; index < parts.length; index++)
          AppSheetChoice(
            value: parts.take(index + 1).join('/'),
            label: parts[index],
          ),
      ],
    );
    if (!mounted ||
        _wsId != wsId ||
        _actorId != actorId ||
        _path != path ||
        destination == null) {
      return;
    }
    _navigateTo(destination);
  }
}
