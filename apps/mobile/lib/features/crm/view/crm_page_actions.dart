part of 'crm_page.dart';

extension _CrmPageActions on _CrmPageState {
  Future<void> _showUserSheet({CrmUser? user}) async {
    final result = await _showOwnedSheet<bool>(
      context: context,
      builder: (context) => _UserFormSheet(
        wsId: _wsId!,
        repository: _repository,
        initialUser: user,
        canEditPrivateProfile: user == null
            ? _workspacePermissions.containsPermission(
                'view_users_private_info',
              )
            : (_userPermissions?.hasPrivateInfo ?? false),
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
      builder: (dialogContext) => AppDialog(
        title: dialogContext.l10n.crmImportUsers,
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(dialogContext.l10n.crmImportPreview(items.length)),
              const SizedBox(height: AppSpacing.md),
              for (final item in items.take(5))
                AppRichRow(
                  title: collapseContactName(item['fullName'] as String),
                  subtitle: item['email'] as String,
                ),
            ],
          ),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonCancel),
          ),
          AppButton.primary(
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
      builder: (context) => AppDialog(
        title: context.l10n.commonDelete,
        content: Text(context.l10n.crmDeleteUserConfirm),
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
        builder: (context) => FractionallySizedBox(
          heightFactor: 0.88,
          child: ContactMergeSheet(
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
    final l10n = context.l10n;
    final action = await _showOwnedSheet<String>(
      context: context,
      builder: (context) => AppActionSheet<String>(
        title: l10n.appsHubMoreTools,
        actions: [
          if (_canCreateUsers)
            AppSheetAction(
              label: l10n.crmImportUsers,
              value: 'import',
              icon: LucideIcons.upload,
            ),
          if (_canViewUsers)
            AppSheetAction(
              label: l10n.crmExportUsers,
              value: 'export',
              icon: LucideIcons.download,
            ),
          if (_canViewUsers &&
              _workspacePermissions.containsPermission('delete_users') &&
              _workspacePermissions.containsPermission('update_users'))
            AppSheetAction(
              label: l10n.crmDetectDuplicates,
              value: 'duplicates',
              icon: LucideIcons.gitMerge,
            ),
          AppSheetAction(
            label: l10n.contactsSections,
            value: 'sections',
            icon: LucideIcons.layoutGrid,
          ),
        ],
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
      case 'sections':
        await _showSectionsSheet();
    }
  }

  Future<void> _showSectionsSheet() async {
    final l10n = context.l10n;
    final section = await _showOwnedSheet<_ContactSection>(
      context: context,
      builder: (context) => AppActionSheet<_ContactSection>(
        title: l10n.contactsSections,
        actions: [
          for (final item in _ContactSection.values)
            AppSheetAction(
              label: _sectionTitleFor(l10n, item),
              value: item,
              icon: LucideIcons.contact,
            ),
        ],
      ),
    );
    if (!mounted || section == null) return;
    await _openSection(section);
  }

  String _sectionTitleFor(AppLocalizations l10n, _ContactSection section) {
    return switch (section) {
      _ContactSection.reports => l10n.contactsReports,
      _ContactSection.attendance => l10n.contactsWorkspaceAttendance,
      _ContactSection.approvals => l10n.contactsApprovals,
      _ContactSection.guestLeads => l10n.contactsGuestLeads,
      _ContactSection.tutoring => l10n.contactsTutoring,
      _ContactSection.metrics => l10n.contactsMetrics,
      _ContactSection.structure => l10n.contactsStructure,
      _ContactSection.announcements => l10n.contactsAnnouncements,
      _ContactSection.workforce => l10n.contactsWorkforce,
    };
  }

  Future<void> _showAttendance(CrmSession session) async {
    final wsId = _wsId;
    final date = contactSessionDate(session);
    if (wsId == null || date == null) return;
    try {
      final members = await _repository.getGroupMembers(wsId, session.groupId);
      final marks = await _repository.getAttendance(
        wsId,
        session.groupId,
        date: date,
        sessionId: session.id,
      );
      if (!mounted) return;
      final saved = await _showOwnedSheet<bool>(
        context: context,
        builder: (context) => ContactAttendanceSheet(
          title: session.label,
          members: members,
          canEdit: _canCheckAttendance,
          initialStatus: {
            for (final mark in marks)
              if (mark.sessionId == null || mark.sessionId == session.id)
                mark.userId: mark.status,
          },
          onSave: (statusByUser) {
            final payload = [
              for (final entry in statusByUser.entries)
                if (entry.value != 'NONE')
                  {
                    'date': date,
                    'status': entry.value,
                    'user_id': entry.key,
                    'session_id': session.id,
                  },
            ];
            if (payload.isEmpty) return Future<void>.value();
            return _repository.saveAttendance(wsId, session.groupId, payload);
          },
        ),
      );
      if (saved == true && mounted) {
        _toast(context.l10n.contactsAttendanceSaved);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showGroupEditor({CrmGroup? group}) async {
    final saved = await _showOwnedSheet<bool>(
      context: context,
      builder: (context) => ContactGroupEditor(
        group: group,
        onSubmit: (payload) {
          final wsId = _wsId;
          if (wsId == null) return Future<void>.value();
          if (group == null) return _repository.createGroup(wsId, payload);
          return _repository.updateGroup(wsId, group.id, payload);
        },
      ),
    );
    if (saved == true && mounted) await _loadInitial();
  }

  Future<void> _showTagEditor({CrmGroupTag? tag}) async {
    final saved = await _showOwnedSheet<bool>(
      context: context,
      builder: (context) => ContactTagEditor(
        groups: _groups,
        tag: tag,
        onSubmit: ({required color, required groupIds, required name}) {
          final wsId = _wsId;
          if (wsId == null) return Future<void>.value();
          if (tag == null) {
            return _repository.createGroupTag(
              wsId,
              name: name,
              color: color,
              groupIds: groupIds,
            );
          }
          return _repository.updateGroupTag(
            wsId,
            tagId: tag.id,
            name: name,
            color: color,
            previousGroupIds: tag.groupIds,
            groupIds: groupIds,
          );
        },
      ),
    );
    if (saved == true && mounted) await _loadInitial();
  }

  Future<void> _showGroupActions(CrmGroup group) async {
    final l10n = context.l10n;
    final action = await _showOwnedSheet<String>(
      context: context,
      builder: (context) => AppActionSheet<String>(
        title: group.name,
        actions: [
          AppSheetAction(
            label: l10n.contactsPeople,
            value: 'people',
            icon: LucideIcons.contact,
          ),
          AppSheetAction(
            label: l10n.crmGroupMembers,
            value: 'members',
            icon: LucideIcons.users,
          ),
          if (_canUpdateGroups)
            AppSheetAction(
              label: l10n.commonEdit,
              value: 'edit',
              icon: LucideIcons.pencil,
            ),
          if (_canDeleteGroups)
            AppSheetAction(
              label: l10n.commonDelete,
              value: 'delete',
              icon: LucideIcons.trash2,
              destructive: true,
            ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'people':
        _filterByGroups([group.id]);
      case 'members':
        await _showOwnedSheet<void>(
          context: context,
          builder: (context) => ContactGroupMembers(
            workspaceId: widget.workspaceId,
            group: group,
            repository: _repository,
            canManage: _canUpdateGroups,
            canSearch: _canViewUsers,
            confirmRemoval: (member) async {
              final confirmed = await _showOwnedDialog<bool>(
                context: context,
                builder: (dialogContext) => AppDialog(
                  title: l10n.crmRemoveGroupMember,
                  content: Text(l10n.crmRemoveGroupMemberConfirm(member.label)),
                  actions: [
                    AppButton.ghost(
                      onPressed: () => Navigator.of(dialogContext).pop(false),
                      child: Text(l10n.commonCancel),
                    ),
                    AppButton.destructive(
                      onPressed: () => Navigator.of(dialogContext).pop(true),
                      child: Text(l10n.crmRemoveGroupMember),
                    ),
                  ],
                ),
              );
              return confirmed ?? false;
            },
          ),
        );
      case 'edit':
        await _showGroupEditor(group: group);
      case 'delete':
        await _deleteGroup(group);
    }
  }

  Future<void> _showTagActions(CrmGroupTag tag) async {
    final l10n = context.l10n;
    final action = await _showOwnedSheet<String>(
      context: context,
      builder: (context) => AppActionSheet<String>(
        title: tag.name,
        actions: [
          if (tag.groupIds.isNotEmpty)
            AppSheetAction(
              label: l10n.contactsPeople,
              value: 'people',
              icon: LucideIcons.contact,
            ),
          if (_canUpdateGroups)
            AppSheetAction(
              label: l10n.commonEdit,
              value: 'edit',
              icon: LucideIcons.pencil,
            ),
          if (_canDeleteGroups)
            AppSheetAction(
              label: l10n.commonDelete,
              value: 'delete',
              icon: LucideIcons.trash2,
              destructive: true,
            ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'people':
        _filterByGroups(tag.groupIds);
      case 'edit':
        await _showTagEditor(tag: tag);
      case 'delete':
        await _deleteGroupTag(tag);
    }
  }

  Future<void> _deleteGroup(CrmGroup group) async {
    final confirmed = await _confirmDelete(
      context.l10n.contactsDeleteGroupConfirm,
    );
    if (confirmed != true || !mounted || _wsId == null) return;
    try {
      await _repository.deleteGroup(_wsId!, group.id);
      if (!mounted) return;
      _toast(context.l10n.contactsSaved);
      await _loadInitial();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteGroupTag(CrmGroupTag tag) async {
    final confirmed = await _confirmDelete(
      context.l10n.contactsDeleteTagConfirm,
    );
    if (confirmed != true || !mounted || _wsId == null) return;
    try {
      await _repository.deleteGroupTag(_wsId!, tag.id);
      if (!mounted) return;
      _toast(context.l10n.contactsSaved);
      await _loadInitial();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<bool?> _confirmDelete(String message) {
    return _showOwnedDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.commonDelete,
        content: Text(message),
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
  }

  Future<void> _showContactActions(CrmUser user) async {
    final l10n = context.l10n;
    final action = await _showOwnedSheet<String>(
      context: context,
      builder: (context) => AppActionSheet<String>(
        title: contactPrimaryNameFor(user),
        actions: [
          if (_canUpdateUsers)
            AppSheetAction(
              label: l10n.commonEdit,
              value: 'edit',
              icon: LucideIcons.pencil,
            ),
          if (_canViewFeedbacks)
            AppSheetAction(
              label: l10n.crmFeedbackAction,
              value: 'feedback',
              icon: LucideIcons.messageCircle,
            ),
          if (_canDeleteUsers)
            AppSheetAction(
              label: l10n.commonDelete,
              value: 'delete',
              icon: LucideIcons.trash2,
              destructive: true,
            ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'edit':
        await _showUserSheet(user: user);
      case 'feedback':
        await _showFeedbackSheet(user);
      case 'delete':
        await _deleteUser(user);
    }
  }

  void _toast(String message, {bool destructive = false}) {
    if (!mounted) return;
    showAppToast(
      context,
      message: message,
      variant: destructive
          ? AppAlertVariant.destructive
          : AppAlertVariant.neutral,
    );
  }
}
