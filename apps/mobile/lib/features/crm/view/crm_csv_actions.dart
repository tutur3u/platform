part of 'crm_page.dart';

extension _CrmCsvActions on _CrmPageState {
  Future<void> _importUsers() async {
    final wsId = _wsId;
    if (wsId == null || !_canCreateUsers) return;

    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'tsv', 'txt'],
      );
      if (!mounted || file == null) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      final preview = parseCrmImportRows(utf8.decode(bytes));
      if (preview.rows.isEmpty) {
        _toast(context.l10n.crmImportEmpty, destructive: true);
        return;
      }

      final confirmed = await _showOwnedSheet<bool>(
        context: context,
        builder: (_) => ContactCsvImportPreview(
          rows: preview.rows,
          skipped: preview.skipped,
        ),
      );
      if (!mounted || confirmed != true || !_canCreateUsers) return;

      final imported = await _repository.bulkImportUsers(wsId, preview.rows);
      if (!mounted) return;
      _toast(
        imported == null
            ? context.l10n.offlineEditQueued
            : context.l10n.crmImportSuccess(imported),
      );
      await _loadInitial();
    } on FormatException {
      if (mounted) _toast(context.l10n.crmCsvInvalid, destructive: true);
    } on Object {
      if (mounted) {
        _toast(context.l10n.commonSomethingWentWrong, destructive: true);
      }
    }
  }

  Future<void> _exportUsers() async {
    final wsId = _wsId;
    if (wsId == null || !_canViewUsers) return;
    final selection =
        await _showOwnedSheet<({List<CrmCsvField> fields, String status})>(
          context: context,
          builder: (context) => ContactCsvExportSheet(
            permissions: _userPermissions,
            initialStatus: _status,
          ),
        );
    if (selection == null || !mounted || !_canViewUsers) return;

    final query = _searchController.text;
    final included = List<String>.of(_includedGroups);
    final excluded = List<String>.of(_excludedGroups);
    final link = _linkStatus;
    final attention = _requireAttention;
    final membership = _groupMembership;
    final withPromotions = selection.fields.any(
      (field) =>
          field == CrmCsvField.linkedPromotionsCount ||
          field == CrmCsvField.linkedPromotionNames,
    );

    try {
      final users = <String, CrmUser>{};
      int? count;
      for (var page = 1; count == null || users.length < count; page++) {
        final result = await CacheStore.awaitRevalidation(
          () => _repository.getUsers(
            wsId,
            query: query,
            page: page,
            pageSize: 100,
            status: selection.status,
            linkStatus: link,
            requireAttention: attention,
            groupMembership: membership,
            includedGroups: included,
            excludedGroups: excluded,
            withPromotions: withPromotions,
          ),
        );
        if (!mounted) return;
        final permissions = _effectivePermissions(result.permissions);
        if (!selection.fields.every((field) => field.visibleTo(permissions))) {
          _toast(context.l10n.crmPermissionDenied, destructive: true);
          return;
        }

        count ??= result.count;
        if (count != result.count) {
          _toast(context.l10n.crmCsvIncomplete, destructive: true);
          return;
        }
        final previousLength = users.length;
        for (final user in result.users) {
          users[user.id] = user;
        }
        if (users.length > count ||
            (users.length < count && users.length == previousLength)) {
          _toast(context.l10n.crmCsvIncomplete, destructive: true);
          return;
        }
      }

      final csv = buildCrmCsv(users.values, selection.fields);
      final timestamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
      final box = context.findRenderObject();
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile.fromData(utf8.encode(csv), mimeType: 'text/csv')],
          fileNameOverrides: ['crm-users-$timestamp.csv'],
          text: context.l10n.crmExportUsers,
          sharePositionOrigin: box is RenderBox
              ? box.localToGlobal(Offset.zero) & box.size
              : null,
        ),
      );
    } on Object {
      if (mounted) _toast(context.l10n.crmCsvIncomplete, destructive: true);
    }
  }
}
