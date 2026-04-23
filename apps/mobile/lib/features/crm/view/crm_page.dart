// This screen keeps app-local imports adjacent for scanability.
// ignore_for_file: directives_ordering

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum _CrmTab { users, audit }

String _crmStatusLabel(BuildContext context, String value) {
  switch (value) {
    case 'archived':
      return context.l10n.commonArchived;
    case 'archived_until':
      return context.l10n.crmArchivedUntil;
    case 'all':
      return context.l10n.commonAll;
    default:
      return context.l10n.commonActive;
  }
}

String _crmLinkStatusLabel(BuildContext context, String value) {
  switch (value) {
    case 'linked':
      return context.l10n.commonLinked;
    case 'virtual':
      return context.l10n.commonVirtual;
    default:
      return context.l10n.commonAll;
  }
}

String _crmRequireAttentionLabel(BuildContext context, String value) {
  switch (value) {
    case 'true':
      return context.l10n.commonRequired;
    case 'false':
      return context.l10n.commonClear;
    default:
      return context.l10n.commonAll;
  }
}

String _crmGroupMembershipLabel(BuildContext context, String value) {
  switch (value) {
    case 'with_groups':
      return context.l10n.commonWithGroups;
    case 'without_groups':
      return context.l10n.commonWithoutGroups;
    default:
      return context.l10n.commonAll;
  }
}

String _crmAuditEventLabel(BuildContext context, String value) {
  switch (value) {
    case 'created':
      return context.l10n.commonCreated;
    case 'updated':
      return context.l10n.commonUpdated;
    case 'archived':
      return context.l10n.commonArchived;
    case 'reactivated':
      return context.l10n.commonReactivated;
    case 'deleted':
      return context.l10n.commonDeleted;
    default:
      return context.l10n.commonAll;
  }
}

String _crmAuditSourceLabel(BuildContext context, String value) {
  switch (value) {
    case 'live':
      return context.l10n.commonLive;
    case 'backfilled':
      return context.l10n.commonBackfilled;
    default:
      return context.l10n.commonAll;
  }
}

String _escapeCsvCell(String? value) {
  final normalized = (value ?? '').replaceAll('"', '""');
  return '"$normalized"';
}

String _buildCrmCsv(List<CrmUser> users) {
  final rows = <String>[
    [
      'full_name',
      'display_name',
      'email',
      'phone',
      'address',
      'note',
      'archived',
      'archived_until',
      'is_guest',
      'require_attention',
      'linked_promotions_count',
      'linked_promotion_names',
    ].map(_escapeCsvCell).join(','),
  ];

  for (final user in users) {
    rows.add(
      [
        user.fullName,
        user.displayName,
        user.email,
        user.phone,
        user.address,
        user.note,
        user.archived.toString(),
        user.archivedUntil,
        user.isGuest.toString(),
        user.requireAttention.toString(),
        user.linkedPromotionsCount.toString(),
        user.linkedPromotionNames,
      ].map((value) => _escapeCsvCell(value?.toString())).join(','),
    );
  }

  return rows.join('\n');
}

List<List<String>> _parseDelimitedRows(String source, String delimiter) {
  final rows = <List<String>>[];
  final currentRow = <String>[];
  final currentCell = StringBuffer();
  var inQuotes = false;

  for (var index = 0; index < source.length; index += 1) {
    final character = source[index];
    final nextCharacter = index + 1 < source.length ? source[index + 1] : null;

    if (character == '"') {
      if (inQuotes && nextCharacter == '"') {
        currentCell.write('"');
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character == delimiter) {
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      continue;
    }

    if (!inQuotes && (character == '\n' || character == '\r')) {
      if (character == '\r' && nextCharacter == '\n') {
        index += 1;
      }
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      if (currentRow.any((value) => value.isNotEmpty)) {
        rows.add(List<String>.from(currentRow));
      }
      currentRow.clear();
      continue;
    }

    currentCell.write(character);
  }

  currentRow.add(currentCell.toString().trim());
  if (currentRow.any((value) => value.isNotEmpty)) {
    rows.add(List<String>.from(currentRow));
  }

  return rows;
}

List<Map<String, dynamic>> _parseCrmImportRows(String source) {
  final normalized = source.replaceAll('\ufeff', '').trim();
  if (normalized.isEmpty) {
    return const <Map<String, dynamic>>[];
  }

  final firstLine = normalized.split(RegExp(r'\r?\n')).first;
  final delimiter = firstLine.contains('\t') ? '\t' : ',';
  final rows = _parseDelimitedRows(normalized, delimiter);
  if (rows.isEmpty) {
    return const <Map<String, dynamic>>[];
  }

  final header = rows.first.map((value) => value.toLowerCase()).toList();
  final hasHeader = header.contains('email') || header.contains('full_name');
  final contentRows = hasHeader ? rows.skip(1) : rows.skip(0);
  final seenEmails = <String>{};
  final items = <Map<String, dynamic>>[];

  for (final row in contentRows) {
    if (row.isEmpty) continue;
    final emailIndex = hasHeader ? header.indexOf('email') : 0;
    final nameIndex = hasHeader
        ? (header.contains('full_name')
              ? header.indexOf('full_name')
              : header.indexOf('fullname'))
        : 1;
    final email =
        (emailIndex >= 0 && emailIndex < row.length ? row[emailIndex] : '')
            .trim()
            .toLowerCase();
    final fullName =
        (nameIndex >= 0 && nameIndex < row.length ? row[nameIndex] : '').trim();

    if (!email.contains('@') || seenEmails.contains(email)) {
      continue;
    }

    seenEmails.add(email);
    items.add({
      'email': email,
      'fullName': fullName.isEmpty ? email.split('@').first : fullName,
    });
  }

  return items;
}

class CrmPage extends StatefulWidget {
  const CrmPage({super.key});

  @override
  State<CrmPage> createState() => _CrmPageState();
}

class _CrmPageState extends State<CrmPage> {
  late final CrmRepository _repository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  _CrmTab _tab = _CrmTab.users;
  List<CrmUser> _users = const <CrmUser>[];
  List<CrmAuditEvent> _auditEvents = const <CrmAuditEvent>[];
  List<CrmGroup> _groups = const <CrmGroup>[];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;
  int _page = 1;
  int _total = 0;
  int _auditOffset = 0;
  int _auditTotal = 0;
  int _requestToken = 0;

  String _status = 'active';
  String _linkStatus = 'all';
  String _requireAttention = 'all';
  String _groupMembership = 'all';
  List<String> _includedGroups = const <String>[];
  List<String> _excludedGroups = const <String>[];

  DateTimeRange _auditRange = DateTimeRange(
    start: DateTime.now().subtract(const Duration(days: 30)),
    end: DateTime.now(),
  );
  String _auditEventKind = 'all';
  String _auditSource = 'all';
  String _affectedUserQuery = '';
  String _actorQuery = '';

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  bool get _canCreateUsers =>
      _workspacePermissions.containsPermission('create_users');
  bool get _canUpdateUsers =>
      _workspacePermissions.containsPermission('update_users');
  bool get _canDeleteUsers =>
      _workspacePermissions.containsPermission('delete_users');
  bool get _canViewUsers =>
      _workspacePermissions.containsPermission('view_users_public_info') ||
      _workspacePermissions.containsPermission('view_users_private_info');
  bool get _canViewAuditLog =>
      _workspacePermissions.containsPermission('manage_workspace_audit_logs');
  bool get _canViewFeedbacks =>
      _workspacePermissions.containsPermission('view_user_groups');
  bool get _canManageFeedbacks =>
      _workspacePermissions.containsPermission('update_user_groups_scores');

  WorkspacePermissions _workspacePermissions = const WorkspacePermissions(
    permissions: <String>{},
    isCreator: false,
  );

  @override
  void initState() {
    super.initState();
    _repository = CrmRepository();
    _permissionsRepository = WorkspacePermissionsRepository();
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _repository.dispose();
    super.dispose();
  }

  Future<void> _loadInitial({bool force = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;

    setState(() {
      _isLoading = true;
      _error = null;
      _page = 1;
      _auditOffset = 0;
    });

    try {
      final permissionsFuture = _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final groupsFuture = _repository.getGroups(wsId);
      final permissions = await permissionsFuture;

      if (!mounted || requestToken != _requestToken) return;
      _workspacePermissions = permissions;

      final futures = <Future<dynamic>>[groupsFuture];
      if (_canViewUsers) {
        futures.add(
          _repository.getUsers(
            wsId,
            query: _searchController.text,
            status: _status,
            linkStatus: _linkStatus,
            requireAttention: _requireAttention,
            groupMembership: _groupMembership,
            includedGroups: _includedGroups,
            excludedGroups: _excludedGroups,
          ),
        );
      }
      if (_canViewAuditLog) {
        futures.add(
          _repository.getAuditLogs(
            wsId,
            start: _auditRange.start.toIso8601String(),
            end: _auditRange.end.toIso8601String(),
            eventKind: _auditEventKind == 'all' ? null : _auditEventKind,
            source: _auditSource == 'all' ? null : _auditSource,
            affectedUserQuery: _affectedUserQuery,
            actorQuery: _actorQuery,
            limit: 50,
          ),
        );
      }

      final results = await Future.wait<dynamic>(futures);
      if (!mounted || requestToken != _requestToken) return;

      var index = 0;
      final groups = results[index++] as List<CrmGroup>;
      CrmUsersResult? usersResult;
      CrmAuditResult? auditResult;
      if (_canViewUsers) {
        usersResult = results[index++] as CrmUsersResult;
      }
      if (_canViewAuditLog) {
        auditResult = results[index++] as CrmAuditResult;
      }

      setState(() {
        _groups = groups;
        _users = usersResult?.users ?? const <CrmUser>[];
        _total = usersResult?.count ?? 0;
        _auditEvents = auditResult?.items ?? const <CrmAuditEvent>[];
        _auditTotal = auditResult?.count ?? 0;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.message);
    } on Object catch (_) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    if (wsId == null || _isLoading || _isLoadingMore) return;

    if (_tab == _CrmTab.users && _users.length >= _total) return;
    if (_tab == _CrmTab.audit && _auditEvents.length >= _auditTotal) return;

    final requestToken = _requestToken;

    setState(() => _isLoadingMore = true);

    try {
      if (_tab == _CrmTab.users) {
        final nextPage = _page + 1;
        final result = await _repository.getUsers(
          wsId,
          query: _searchController.text,
          page: nextPage,
          status: _status,
          linkStatus: _linkStatus,
          requireAttention: _requireAttention,
          groupMembership: _groupMembership,
          includedGroups: _includedGroups,
          excludedGroups: _excludedGroups,
        );
        if (!mounted || requestToken != _requestToken) return;
        setState(() {
          _users = <CrmUser>[..._users, ...result.users];
          _page = nextPage;
          _total = result.count;
        });
      } else {
        final nextOffset = _auditOffset + 50;
        final result = await _repository.getAuditLogs(
          wsId,
          start: _auditRange.start.toIso8601String(),
          end: _auditRange.end.toIso8601String(),
          eventKind: _auditEventKind == 'all' ? null : _auditEventKind,
          source: _auditSource == 'all' ? null : _auditSource,
          affectedUserQuery: _affectedUserQuery,
          actorQuery: _actorQuery,
          offset: nextOffset,
          limit: 50,
        );
        if (!mounted || requestToken != _requestToken) return;
        setState(() {
          _auditEvents = <CrmAuditEvent>[..._auditEvents, ...result.items];
          _auditOffset = nextOffset;
          _auditTotal = result.count;
        });
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoadingMore = false);
      }
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), _loadInitial);
  }

  Future<void> _showUserSheet({CrmUser? user}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _UserFormSheet(
        wsId: _wsId!,
        repository: _repository,
        initialUser: user,
        canEdit: user == null ? _canCreateUsers : _canUpdateUsers,
        onSubmit: (payload) async {
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

    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'tsv', 'txt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;

    final file = result.files.single;
    final bytes =
        file.bytes ??
        (file.path == null ? null : await File(file.path!).readAsBytes());
    if (bytes == null || !mounted) return;

    final items = _parseCrmImportRows(utf8.decode(bytes));
    if (items.isEmpty) {
      _toast(context.l10n.crmImportEmpty, destructive: true);
      return;
    }

    final confirmed = await showDialog<bool>(
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

    if (confirmed != true) return;

    try {
      await _repository.bulkImportUsers(wsId, items);
      if (!mounted) return;
      _toast(context.l10n.crmImportSuccess(items.length));
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
    final confirmed = await showDialog<bool>(
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
    if (confirmed != true) return;

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
    await showModalBottomSheet<void>(
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
      await showModalBottomSheet<void>(
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
    final result = await showModalBottomSheet<Map<String, dynamic>>(
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
    if (result == null) return;

    setState(() {
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
    final result = await showModalBottomSheet<Map<String, dynamic>>(
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
    if (result == null) return;
    setState(() {
      _auditRange = result['range'] as DateTimeRange;
      _auditEventKind = result['eventKind'] as String;
      _auditSource = result['source'] as String;
      _affectedUserQuery = result['affectedUserQuery'] as String;
      _actorQuery = result['actorQuery'] as String;
    });
    await _loadInitial();
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canShowCurrentTab = _tab == _CrmTab.users
        ? _canViewUsers
        : _canViewAuditLog;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadInitial()),
      child: shad.Scaffold(
        child: ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: _isLoading && (_users.isEmpty && _auditEvents.isEmpty)
              ? const Center(child: NovaLoadingIndicator())
              : RefreshIndicator(
                  onRefresh: _loadInitial,
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(
                      16,
                      8,
                      16,
                      40 + MediaQuery.paddingOf(context).bottom,
                    ),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.crmTitle,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 12),
                              SegmentedButton<_CrmTab>(
                                segments: [
                                  ButtonSegment(
                                    value: _CrmTab.users,
                                    label: Text(l10n.crmUsersTab),
                                  ),
                                  ButtonSegment(
                                    value: _CrmTab.audit,
                                    label: Text(l10n.crmAuditTab),
                                  ),
                                ],
                                selected: <_CrmTab>{_tab},
                                onSelectionChanged: (values) {
                                  setState(() => _tab = values.first);
                                },
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _searchController,
                                      onChanged: _onSearchChanged,
                                      decoration: InputDecoration(
                                        prefixIcon: const Icon(Icons.search),
                                        hintText: _tab == _CrmTab.users
                                            ? l10n.crmSearchUsersHint
                                            : l10n.crmSearchAuditHint,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  FilledButton.tonalIcon(
                                    onPressed: _tab == _CrmTab.users
                                        ? _showUsersFilterSheet
                                        : _showAuditFilterSheet,
                                    icon: const Icon(Icons.filter_list),
                                    label: Text(l10n.commonFilters),
                                  ),
                                ],
                              ),
                              if (_tab == _CrmTab.users) ...[
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    if (_canCreateUsers)
                                      FilledButton.icon(
                                        onPressed: _showUserSheet,
                                        icon: const Icon(
                                          Icons.person_add_alt_1,
                                        ),
                                        label: Text(l10n.crmCreateUser),
                                      ),
                                    if (_canCreateUsers)
                                      FilledButton.tonalIcon(
                                        onPressed: _importUsers,
                                        icon: const Icon(Icons.upload_file),
                                        label: Text(l10n.crmImportUsers),
                                      ),
                                    if (_canViewUsers)
                                      FilledButton.tonalIcon(
                                        onPressed: _exportUsers,
                                        icon: const Icon(Icons.download),
                                        label: Text(l10n.crmExportUsers),
                                      ),
                                    if (_canViewUsers &&
                                        _workspacePermissions
                                            .containsPermission(
                                              'delete_users',
                                            ) &&
                                        _workspacePermissions
                                            .containsPermission('update_users'))
                                      FilledButton.tonalIcon(
                                        onPressed: _showDuplicateSheet,
                                        icon: const Icon(Icons.merge_type),
                                        label: Text(l10n.crmDetectDuplicates),
                                      ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (!canShowCurrentTab)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(l10n.crmPermissionDenied),
                          ),
                        )
                      else if (_error != null)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(_error!),
                          ),
                        )
                      else if (_tab == _CrmTab.users)
                        ..._users.map(
                          (user) => _CrmUserCard(
                            user: user,
                            onEdit: _canUpdateUsers
                                ? () => _showUserSheet(user: user)
                                : null,
                            onDelete: _canDeleteUsers
                                ? () => _deleteUser(user)
                                : null,
                            onFeedback: _canViewFeedbacks
                                ? () => _showFeedbackSheet(user)
                                : null,
                          ),
                        )
                      else
                        ..._auditEvents.map(
                          (event) => _CrmAuditCard(event: event),
                        ),
                      if ((_tab == _CrmTab.users && _users.isEmpty) ||
                          (_tab == _CrmTab.audit && _auditEvents.isEmpty))
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              _tab == _CrmTab.users
                                  ? l10n.crmEmptyUsers
                                  : l10n.crmEmptyAudit,
                            ),
                          ),
                        ),
                      if ((_tab == _CrmTab.users && _users.length < _total) ||
                          (_tab == _CrmTab.audit &&
                              _auditEvents.length < _auditTotal))
                        Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Center(
                            child: FilledButton.tonal(
                              onPressed: _isLoadingMore ? null : _loadMore,
                              child: _isLoadingMore
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(l10n.commonLoadMore),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

class _CrmUserCard extends StatelessWidget {
  const _CrmUserCard({
    required this.user,
    this.onEdit,
    this.onDelete,
    this.onFeedback,
  });

  final CrmUser user;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onFeedback;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundImage: user.avatarUrl == null
              ? null
              : NetworkImage(user.avatarUrl!),
          child: user.avatarUrl == null
              ? Text(user.label.characters.first.toUpperCase())
              : null,
        ),
        title: Text(user.label),
        subtitle: Text(
          [
                user.email,
                user.phone,
                if (user.requireAttention) context.l10n.crmRequireAttention,
              ]
              .whereType<String>()
              .where((value) => value.isNotEmpty)
              .join(
                ' • ',
              ),
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (value) {
            if (value == 'edit') onEdit?.call();
            if (value == 'delete') onDelete?.call();
            if (value == 'feedback') onFeedback?.call();
          },
          itemBuilder: (context) => [
            if (onEdit != null)
              PopupMenuItem(
                value: 'edit',
                child: Text(context.l10n.commonEdit),
              ),
            if (onFeedback != null)
              PopupMenuItem(
                value: 'feedback',
                child: Text(context.l10n.crmFeedbackAction),
              ),
            if (onDelete != null)
              PopupMenuItem(
                value: 'delete',
                child: Text(context.l10n.commonDelete),
              ),
          ],
        ),
      ),
    );
  }
}

class _CrmAuditCard extends StatelessWidget {
  const _CrmAuditCard({required this.event});

  final CrmAuditEvent event;

  @override
  Widget build(BuildContext context) {
    final occurredAt = DateFormat.yMMMd().add_Hm().format(
      DateTime.parse(event.occurredAt).toLocal(),
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ExpansionTile(
        title: Text(event.summary),
        subtitle: Text(
          '${event.affectedUser.label} • ${event.actor.label} • $occurredAt',
        ),
        children: event.fieldChanges
            .map(
              (change) => ListTile(
                dense: true,
                title: Text(change.label),
                subtitle: Text(
                  '${change.before ?? '-'} → ${change.after ?? '-'}',
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

class _UserFormSheet extends StatefulWidget {
  const _UserFormSheet({
    required this.wsId,
    required this.repository,
    required this.onSubmit,
    required this.canEdit,
    this.initialUser,
  });

  final String wsId;
  final CrmRepository repository;
  final CrmUser? initialUser;
  final bool canEdit;
  final Future<void> Function(Map<String, dynamic>) onSubmit;

  @override
  State<_UserFormSheet> createState() => _UserFormSheetState();
}

class _UserFormSheetState extends State<_UserFormSheet> {
  late final TextEditingController _fullNameController;
  late final TextEditingController _displayNameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late final TextEditingController _addressController;
  late final TextEditingController _noteController;
  bool _isGuest = false;
  bool _archived = false;
  DateTime? _birthday;
  DateTime? _archivedUntil;
  XFile? _avatarFile;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController(
      text: widget.initialUser?.fullName ?? '',
    );
    _displayNameController = TextEditingController(
      text: widget.initialUser?.displayName ?? '',
    );
    _emailController = TextEditingController(
      text: widget.initialUser?.email ?? '',
    );
    _phoneController = TextEditingController(
      text: widget.initialUser?.phone ?? '',
    );
    _addressController = TextEditingController(
      text: widget.initialUser?.address ?? '',
    );
    _noteController = TextEditingController(
      text: widget.initialUser?.note ?? '',
    );
    _isGuest = widget.initialUser?.isGuest ?? false;
    _archived = widget.initialUser?.archived ?? false;
    _birthday = widget.initialUser?.birthday == null
        ? null
        : DateTime.tryParse(widget.initialUser!.birthday!);
    _archivedUntil = widget.initialUser?.archivedUntil == null
        ? null
        : DateTime.tryParse(widget.initialUser!.archivedUntil!);
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _displayNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      var avatarUrl = widget.initialUser?.avatarUrl;
      if (_avatarFile != null) {
        final bytes = await _avatarFile!.readAsBytes();
        final contentType =
            lookupMimeType(
              _avatarFile!.name,
              headerBytes: bytes.take(12).toList(),
            ) ??
            'image/jpeg';
        avatarUrl = await widget.repository.uploadAvatar(
          widget.wsId,
          fileName: _avatarFile!.name,
          contentType: contentType,
          bytes: bytes,
        );
      }

      await widget.onSubmit({
        'full_name': _fullNameController.text.trim(),
        'display_name': _displayNameController.text.trim(),
        'email': _emailController.text.trim().isEmpty
            ? null
            : _emailController.text.trim(),
        'phone': _phoneController.text.trim().isEmpty
            ? null
            : _phoneController.text.trim(),
        'address': _addressController.text.trim().isEmpty
            ? null
            : _addressController.text.trim(),
        'note': _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
        'birthday': _birthday?.toIso8601String(),
        'is_guest': _isGuest,
        'archived': _archived,
        'archived_until': _archivedUntil?.toIso8601String(),
        'avatar_url': avatarUrl,
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showError(error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.SurfaceCard(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(message, style: const TextStyle(color: Colors.red)),
        ),
      ),
    );
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final selected = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1200,
    );
    if (selected == null || !mounted) return;
    setState(() => _avatarFile = selected);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final avatarLabelSource =
        (widget.initialUser?.label ?? _fullNameController.text.trim()).trim();
    final avatarLabel = avatarLabelSource.isEmpty
        ? '?'
        : avatarLabelSource.characters.first.toUpperCase();
    final avatarImage = _avatarFile == null
        ? null
        : FileImage(File(_avatarFile!.path)) as ImageProvider<Object>;
    final fallbackImage = widget.initialUser?.avatarUrl == null
        ? null
        : NetworkImage(widget.initialUser!.avatarUrl!);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.initialUser == null
                    ? l10n.crmCreateUser
                    : l10n.commonEdit,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundImage: avatarImage ?? fallbackImage,
                    child: avatarImage == null && fallbackImage == null
                        ? Text(avatarLabel)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  FilledButton.tonalIcon(
                    onPressed: widget.canEdit ? _pickAvatar : null,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(l10n.crmUploadAvatar),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _fullNameController,
                decoration: InputDecoration(labelText: l10n.crmFullName),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _displayNameController,
                decoration: InputDecoration(labelText: l10n.crmDisplayName),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailController,
                decoration: InputDecoration(labelText: l10n.emailLabel),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phoneController,
                decoration: InputDecoration(labelText: l10n.crmPhone),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _addressController,
                decoration: InputDecoration(labelText: l10n.crmAddress),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                minLines: 3,
                maxLines: 5,
                decoration: InputDecoration(labelText: l10n.crmNote),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                value: _isGuest,
                onChanged: (value) => setState(() => _isGuest = value),
                title: Text(l10n.crmGuestUser),
              ),
              SwitchListTile(
                value: _archived,
                onChanged: (value) => setState(() => _archived = value),
                title: Text(l10n.crmArchived),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.crmBirthday),
                subtitle: Text(
                  _birthday == null
                      ? l10n.commonSelectDate
                      : DateFormat.yMMMd().format(_birthday!),
                ),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _birthday ?? DateTime.now(),
                    firstDate: DateTime(1900),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setState(() => _birthday = picked);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.crmArchivedUntil),
                subtitle: Text(
                  _archivedUntil == null
                      ? l10n.commonSelectDate
                      : DateFormat.yMMMd().format(_archivedUntil!),
                ),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _archivedUntil ?? DateTime.now(),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 3650)),
                  );
                  if (picked != null) setState(() => _archivedUntil = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving || !widget.canEdit ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({
    required this.wsId,
    required this.user,
    required this.groups,
    required this.repository,
    required this.canManageFeedbacks,
  });

  final String wsId;
  final CrmUser user;
  final List<CrmGroup> groups;
  final CrmRepository repository;
  final bool canManageFeedbacks;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  List<CrmFeedback> _items = const <CrmFeedback>[];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final result = await widget.repository.getFeedbacks(
        widget.wsId,
        userId: widget.user.id,
        pageSize: 100,
      );
      if (!mounted) return;
      setState(() {
        _items = result.items;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editFeedback([CrmFeedback? feedback]) async {
    final contentController = TextEditingController(
      text: feedback?.content ?? '',
    );
    var selectedGroupId = feedback?.groupId;
    if (selectedGroupId == null && widget.groups.isNotEmpty) {
      selectedGroupId = widget.groups.first.id;
    }
    var requireAttention = feedback?.requireAttention ?? false;

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          feedback == null
              ? context.l10n.crmAddFeedback
              : context.l10n.commonEdit,
        ),
        content: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedGroupId,
                items: widget.groups
                    .map(
                      (group) => DropdownMenuItem(
                        value: group.id,
                        child: Text(group.name),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (value) => setState(() => selectedGroupId = value),
                decoration: InputDecoration(labelText: context.l10n.crmGroup),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: contentController,
                minLines: 3,
                maxLines: 5,
                decoration: InputDecoration(
                  labelText: context.l10n.crmFeedback,
                ),
              ),
              SwitchListTile(
                value: requireAttention,
                onChanged: (value) => setState(() => requireAttention = value),
                title: Text(context.l10n.crmRequireAttention),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonSave),
          ),
        ],
      ),
    );

    if (saved != true || selectedGroupId == null) return;

    if (feedback == null) {
      await widget.repository.createFeedback(
        widget.wsId,
        userId: widget.user.id,
        groupId: selectedGroupId!,
        content: contentController.text,
        requireAttention: requireAttention,
      );
    } else {
      await widget.repository.updateFeedback(
        widget.wsId,
        feedbackId: feedback.id,
        content: contentController.text,
        requireAttention: requireAttention,
      );
    }

    await _load();
  }

  Future<void> _deleteFeedback(CrmFeedback feedback) async {
    await widget.repository.deleteFeedback(
      widget.wsId,
      feedbackId: feedback.id,
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.crmFeedbackFor(widget.user.label),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            if (widget.canManageFeedbacks)
              FilledButton.tonalIcon(
                onPressed: _editFeedback,
                icon: const Icon(Icons.add_comment_outlined),
                label: Text(context.l10n.crmAddFeedback),
              ),
            const SizedBox(height: 16),
            Expanded(
              child: _loading
                  ? const Center(child: NovaLoadingIndicator())
                  : ListView(
                      children: _items
                          .map(
                            (item) => Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                title: Text(
                                  item.groupName ?? item.group?.name ?? '',
                                ),
                                subtitle: Text(item.content),
                                trailing: widget.canManageFeedbacks
                                    ? PopupMenuButton<String>(
                                        onSelected: (value) {
                                          if (value == 'edit') {
                                            unawaited(_editFeedback(item));
                                          }
                                          if (value == 'delete') {
                                            unawaited(_deleteFeedback(item));
                                          }
                                        },
                                        itemBuilder: (context) => [
                                          PopupMenuItem(
                                            value: 'edit',
                                            child: Text(
                                              context.l10n.commonEdit,
                                            ),
                                          ),
                                          PopupMenuItem(
                                            value: 'delete',
                                            child: Text(
                                              context.l10n.commonDelete,
                                            ),
                                          ),
                                        ],
                                      )
                                    : null,
                              ),
                            ),
                          )
                          .toList(growable: false),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DuplicateUsersSheet extends StatefulWidget {
  const _DuplicateUsersSheet({
    required this.result,
    required this.onMerge,
  });

  final CrmDuplicateDetectionResult result;
  final Future<CrmMergeResult> Function(String sourceId, String targetId)
  onMerge;

  @override
  State<_DuplicateUsersSheet> createState() => _DuplicateUsersSheetState();
}

class _DuplicateUsersSheetState extends State<_DuplicateUsersSheet> {
  late final Map<int, String> _selectedTargets;
  bool _merging = false;

  @override
  void initState() {
    super.initState();
    _selectedTargets = {
      for (final cluster in widget.result.clusters)
        cluster.clusterId: cluster.suggestedTargetId,
    };
  }

  Future<void> _mergeCluster(CrmDuplicateCluster cluster) async {
    final targetId = _selectedTargets[cluster.clusterId];
    if (targetId == null) return;
    final source = cluster.users.firstWhere((user) => user.id != targetId);
    setState(() => _merging = true);
    try {
      await widget.onMerge(source.id, targetId);
      if (!mounted) return;
      Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _merging = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.crmDuplicateResults(widget.result.clusters.length),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                children: widget.result.clusters
                    .map(
                      (cluster) => Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(cluster.matchReason),
                              const SizedBox(height: 12),
                              DropdownButtonFormField<String>(
                                initialValue:
                                    _selectedTargets[cluster.clusterId],
                                items: cluster.users
                                    .map(
                                      (user) => DropdownMenuItem(
                                        value: user.id,
                                        child: Text(user.label),
                                      ),
                                    )
                                    .toList(growable: false),
                                onChanged: (value) {
                                  if (value == null) return;
                                  setState(() {
                                    _selectedTargets[cluster.clusterId] = value;
                                  });
                                },
                                decoration: InputDecoration(
                                  labelText: context.l10n.crmMergeTarget,
                                ),
                              ),
                              const SizedBox(height: 12),
                              ...cluster.users.map(
                                (user) => ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(user.label),
                                  subtitle: Text(
                                    [
                                      user.email,
                                      user.phone,
                                      if (user.isLinked)
                                        context.l10n.crmLinkedUser,
                                    ].whereType<String>().join(' • '),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              FilledButton.tonal(
                                onPressed: _merging
                                    ? null
                                    : () => _mergeCluster(cluster),
                                child: Text(context.l10n.crmMergeUsers),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UsersFilterSheet extends StatefulWidget {
  const _UsersFilterSheet({
    required this.groups,
    required this.status,
    required this.linkStatus,
    required this.requireAttention,
    required this.groupMembership,
    required this.includedGroups,
    required this.excludedGroups,
  });

  final List<CrmGroup> groups;
  final String status;
  final String linkStatus;
  final String requireAttention;
  final String groupMembership;
  final List<String> includedGroups;
  final List<String> excludedGroups;

  @override
  State<_UsersFilterSheet> createState() => _UsersFilterSheetState();
}

class _UsersFilterSheetState extends State<_UsersFilterSheet> {
  late String _status;
  late String _linkStatus;
  late String _requireAttention;
  late String _groupMembership;
  late List<String> _includedGroups;
  late List<String> _excludedGroups;

  @override
  void initState() {
    super.initState();
    _status = widget.status;
    _linkStatus = widget.linkStatus;
    _requireAttention = widget.requireAttention;
    _groupMembership = widget.groupMembership;
    _includedGroups = List<String>.from(widget.includedGroups);
    _excludedGroups = List<String>.from(widget.excludedGroups);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.commonFilters,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _status,
                items: [
                  DropdownMenuItem(
                    value: 'active',
                    child: Text(_crmStatusLabel(context, 'active')),
                  ),
                  DropdownMenuItem(
                    value: 'archived',
                    child: Text(_crmStatusLabel(context, 'archived')),
                  ),
                  DropdownMenuItem(
                    value: 'archived_until',
                    child: Text(_crmStatusLabel(context, 'archived_until')),
                  ),
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmStatusLabel(context, 'all')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _status = value ?? 'active'),
                decoration: InputDecoration(labelText: context.l10n.crmStatus),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _linkStatus,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmLinkStatusLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'linked',
                    child: Text(_crmLinkStatusLabel(context, 'linked')),
                  ),
                  DropdownMenuItem(
                    value: 'virtual',
                    child: Text(_crmLinkStatusLabel(context, 'virtual')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _linkStatus = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmLinkStatus,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _requireAttention,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmRequireAttentionLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'true',
                    child: Text(_crmRequireAttentionLabel(context, 'true')),
                  ),
                  DropdownMenuItem(
                    value: 'false',
                    child: Text(_crmRequireAttentionLabel(context, 'false')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _requireAttention = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmRequireAttention,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _groupMembership,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmGroupMembershipLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'with_groups',
                    child: Text(
                      _crmGroupMembershipLabel(context, 'with_groups'),
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'without_groups',
                    child: Text(
                      _crmGroupMembershipLabel(context, 'without_groups'),
                    ),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _groupMembership = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmGroupMembership,
                ),
              ),
              const SizedBox(height: 16),
              Text(context.l10n.crmIncludedGroups),
              Wrap(
                spacing: 8,
                children: widget.groups
                    .map(
                      (group) => FilterChip(
                        label: Text(group.name),
                        selected: _includedGroups.contains(group.id),
                        onSelected: (value) {
                          setState(() {
                            if (value) {
                              _includedGroups.add(group.id);
                            } else {
                              _includedGroups.remove(group.id);
                            }
                          });
                        },
                      ),
                    )
                    .toList(growable: false),
              ),
              const SizedBox(height: 16),
              Text(context.l10n.crmExcludedGroups),
              Wrap(
                spacing: 8,
                children: widget.groups
                    .map(
                      (group) => FilterChip(
                        label: Text(group.name),
                        selected: _excludedGroups.contains(group.id),
                        onSelected: (value) {
                          setState(() {
                            if (value) {
                              _excludedGroups.add(group.id);
                            } else {
                              _excludedGroups.remove(group.id);
                            }
                          });
                        },
                      ),
                    )
                    .toList(growable: false),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop({
                  'status': _status,
                  'linkStatus': _linkStatus,
                  'requireAttention': _requireAttention,
                  'groupMembership': _groupMembership,
                  'includedGroups': _includedGroups,
                  'excludedGroups': _excludedGroups,
                }),
                child: Text(context.l10n.commonApply),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuditFilterSheet extends StatefulWidget {
  const _AuditFilterSheet({
    required this.range,
    required this.eventKind,
    required this.source,
    required this.affectedUserQuery,
    required this.actorQuery,
  });

  final DateTimeRange range;
  final String eventKind;
  final String source;
  final String affectedUserQuery;
  final String actorQuery;

  @override
  State<_AuditFilterSheet> createState() => _AuditFilterSheetState();
}

class _AuditFilterSheetState extends State<_AuditFilterSheet> {
  late DateTimeRange _range;
  late String _eventKind;
  late String _source;
  late final TextEditingController _affectedController;
  late final TextEditingController _actorController;

  @override
  void initState() {
    super.initState();
    _range = widget.range;
    _eventKind = widget.eventKind;
    _source = widget.source;
    _affectedController = TextEditingController(text: widget.affectedUserQuery);
    _actorController = TextEditingController(text: widget.actorQuery);
  }

  @override
  void dispose() {
    _affectedController.dispose();
    _actorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.l10n.commonFilters,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(context.l10n.crmAuditRange),
              subtitle: Text(
                '${DateFormat.yMMMd().format(_range.start)} - '
                '${DateFormat.yMMMd().format(_range.end)}',
              ),
              onTap: () async {
                final picked = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                  initialDateRange: _range,
                );
                if (picked != null) setState(() => _range = picked);
              },
            ),
            DropdownButtonFormField<String>(
              initialValue: _eventKind,
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(_crmAuditEventLabel(context, 'all')),
                ),
                DropdownMenuItem(
                  value: 'created',
                  child: Text(_crmAuditEventLabel(context, 'created')),
                ),
                DropdownMenuItem(
                  value: 'updated',
                  child: Text(_crmAuditEventLabel(context, 'updated')),
                ),
                DropdownMenuItem(
                  value: 'archived',
                  child: Text(_crmAuditEventLabel(context, 'archived')),
                ),
                DropdownMenuItem(
                  value: 'reactivated',
                  child: Text(_crmAuditEventLabel(context, 'reactivated')),
                ),
                DropdownMenuItem(
                  value: 'deleted',
                  child: Text(_crmAuditEventLabel(context, 'deleted')),
                ),
              ],
              onChanged: (value) => setState(() => _eventKind = value ?? 'all'),
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditEvent,
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _source,
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(_crmAuditSourceLabel(context, 'all')),
                ),
                DropdownMenuItem(
                  value: 'live',
                  child: Text(_crmAuditSourceLabel(context, 'live')),
                ),
                DropdownMenuItem(
                  value: 'backfilled',
                  child: Text(_crmAuditSourceLabel(context, 'backfilled')),
                ),
              ],
              onChanged: (value) => setState(() => _source = value ?? 'all'),
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditSource,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _affectedController,
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditAffectedUser,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _actorController,
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditActor,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).pop({
                'range': _range,
                'eventKind': _eventKind,
                'source': _source,
                'affectedUserQuery': _affectedController.text.trim(),
                'actorQuery': _actorController.text.trim(),
              }),
              child: Text(context.l10n.commonApply),
            ),
          ],
        ),
      ),
    );
  }
}
