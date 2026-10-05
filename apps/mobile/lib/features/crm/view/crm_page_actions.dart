part of 'crm_page.dart';

extension _CrmPageActions on _CrmPageState {
  Future<void> _showUserSheet({CrmUser? user}) async {
    final result = await _showOwnedSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _UserFormSheet(
        wsId: _wsId!,
        repository: _repository,
        initialUser: user,
        canEdit: user == null ? _canCreateUsers : _canUpdateUsers,
        onSubmit: (payload) async {
          if (!mounted) throw StateError('CRM session changed');
          if (user == null) {
            await _repository.createUser(_wsId!, payload);
          } else {
            await _repository.updateUser(_wsId!, user.id, payload);
          }
        },
      ),
    );

    if (result == true && mounted) {
      await _loadInitial();
    }
  }

  Future<void> _importUsers() async {
    final wsId = _wsId;
    if (wsId == null) return;

    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'tsv', 'txt'],
    );
    if (file == null) return;

    final bytes = await file.readAsBytes();
    if (!mounted) return;

    final items = _parseCrmImportRows(utf8.decode(bytes));
    if (items.isEmpty) {
      _toast(context.l10n.crmImportEmpty, destructive: true);
      return;
    }

    final confirmed = await _showOwnedDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(dialogContext.l10n.crmImportUsers),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(dialogContext.l10n.crmImportPreview(items.length)),
              const SizedBox(height: 12),
              ...items
                  .take(5)
                  .map(
                    (item) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(item['fullName'] as String),
                      subtitle: Text(item['email'] as String),
                    ),
                  ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.commonImport),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      final queued = await _repository.bulkImportUsers(wsId, items);
      if (!mounted) return;
      _toast(
        queued
            ? context.l10n.offlineEditQueued
            : context.l10n.crmImportSuccess(items.length),
      );
      await _loadInitial();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _exportUsers() async {
    final wsId = _wsId;
    if (wsId == null) return;

    try {
      final exportedUsers = <CrmUser>[];
      var currentPage = 1;
      var totalCount = 0;

      do {
        final result = await _repository.getUsers(
          wsId,
          query: _searchController.text,
          page: currentPage,
          pageSize: 100,
          status: _status,
          linkStatus: _linkStatus,
          requireAttention: _requireAttention,
          groupMembership: _groupMembership,
          includedGroups: _includedGroups,
          excludedGroups: _excludedGroups,
          withPromotions: true,
        );
        exportedUsers.addAll(result.users);
        totalCount = result.count;
        currentPage += 1;
      } while (exportedUsers.length < totalCount);

      final csv = _buildCrmCsv(exportedUsers);
      final directory = await getTemporaryDirectory();
      final timestamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
      final file = File('${directory.path}/crm-users-$timestamp.csv');
      await file.writeAsString(csv);

      if (!mounted) return;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          text: context.l10n.crmExportUsers,
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteUser(CrmUser user) async {
    final confirmed = await _showOwnedDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.commonDelete),
        content: Text(context.l10n.crmDeleteUserConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await _repository.deleteUser(_wsId!, user.id);
      if (!mounted) return;
      _toast(context.l10n.crmDeleteUserSuccess);
      await _loadInitial();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showFeedbackSheet(CrmUser user) async {
    await _showOwnedSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.88,
        child: _FeedbackSheet(
          wsId: _wsId!,
          user: user,
          groups: _groups,
          repository: _repository,
          canManageFeedbacks: _canManageFeedbacks,
        ),
      ),
    );
  }

  Future<void> _showDuplicateSheet() async {
    final wsId = _wsId;
    if (wsId == null) return;

    try {
      final result = await _repository.detectDuplicates(wsId);
      if (!mounted) return;
      await _showOwnedSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => FractionallySizedBox(
          heightFactor: 0.88,
          child: _DuplicateUsersSheet(
            result: result,
            onMerge: (sourceId, targetId) => _repository.mergeUsers(
              wsId,
              sourceId: sourceId,
              targetId: targetId,
            ),
          ),
        ),
      );
      if (!mounted) return;
      await _loadInitial();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showUsersFilterSheet() async {
    final result = await _showOwnedSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _UsersFilterSheet(
        groups: _groups,
        status: _status,
        linkStatus: _linkStatus,
        requireAttention: _requireAttention,
        groupMembership: _groupMembership,
        includedGroups: _includedGroups,
        excludedGroups: _excludedGroups,
      ),
    );
    if (result == null || !mounted) return;

    _updateState(() {
      _status = result['status'] as String;
      _linkStatus = result['linkStatus'] as String;
      _requireAttention = result['requireAttention'] as String;
      _groupMembership = result['groupMembership'] as String;
      _includedGroups = (result['includedGroups'] as List<dynamic>)
          .cast<String>();
      _excludedGroups = (result['excludedGroups'] as List<dynamic>)
          .cast<String>();
    });
    await _loadInitial();
  }

  Future<void> _showAuditFilterSheet() async {
    final result = await _showOwnedSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _AuditFilterSheet(
        range: _auditRange,
        eventKind: _auditEventKind,
        source: _auditSource,
        affectedUserQuery: _affectedUserQuery,
        actorQuery: _actorQuery,
      ),
    );
    if (result == null || !mounted) return;
    _updateState(() {
      _auditRange = result['range'] as DateTimeRange;
      _auditEventKind = result['eventKind'] as String;
      _auditSource = result['source'] as String;
      _affectedUserQuery = result['affectedUserQuery'] as String;
      _actorQuery = result['actorQuery'] as String;
    });
    await _loadInitial();
  }

  Future<void> _showCrmToolsSheet() async {
    final action = await _showOwnedSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_canCreateUsers)
              ListTile(
                leading: const Icon(Icons.upload_file_outlined),
                title: Text(context.l10n.crmImportUsers),
                onTap: () => Navigator.of(context).pop('import'),
              ),
            if (_canViewUsers)
              ListTile(
                leading: const Icon(Icons.download_outlined),
                title: Text(context.l10n.crmExportUsers),
                onTap: () => Navigator.of(context).pop('export'),
              ),
            if (_canViewUsers &&
                _workspacePermissions.containsPermission('delete_users') &&
                _workspacePermissions.containsPermission('update_users'))
              ListTile(
                leading: const Icon(Icons.merge_type_rounded),
                title: Text(context.l10n.crmDetectDuplicates),
                onTap: () => Navigator.of(context).pop('duplicates'),
              ),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;

    switch (action) {
      case 'import':
        await _importUsers();
      case 'export':
        await _exportUsers();
      case 'duplicates':
        await _showDuplicateSheet();
    }
  }

  void _toast(String message, {bool destructive = false}) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.SurfaceCard(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            message,
            style: TextStyle(color: destructive ? Colors.red : null),
          ),
        ),
      ),
    );
  }
}
