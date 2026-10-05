// This screen keeps app-local imports adjacent for scanability.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/crm/utils/crm_csv_export.dart';
import 'package:mobile/features/crm/utils/crm_failure_policy.dart';
import 'package:mobile/features/crm/utils/crm_visibility.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:share_plus/share_plus.dart';

part 'crm_duplicate_users_sheet.dart';
part 'crm_feedback_sheet.dart';
part 'crm_filter_sheets.dart';
part 'crm_loading_rows.dart';
part 'crm_owned_overlay.dart';
part 'crm_page_actions.dart';
part 'crm_page_data.dart';
part 'crm_page_helpers.dart';
part 'crm_page_layout.dart';
part 'crm_user_card.dart';
part 'crm_user_detail.dart';
part 'crm_user_form.dart';
part 'crm_view_components.dart';

class CrmPage extends StatelessWidget {
  const CrmPage({super.key});

  @override
  Widget build(BuildContext context) {
    final actorId = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (actorId == null || workspaceId == null) return const SizedBox.shrink();
    return CrmWorkspace(
      key: ValueKey('$actorId:$workspaceId'),
      actorId: actorId,
      workspaceId: workspaceId,
    );
  }
}

/// A mounted CRM session owns exactly one account and workspace.
class CrmWorkspace extends StatefulWidget {
  const CrmWorkspace({
    required this.actorId,
    required this.workspaceId,
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final String actorId;
  final String workspaceId;
  final CrmRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<CrmWorkspace> createState() => _CrmPageState();
}

class _CrmPageState extends State<CrmWorkspace> {
  late final CrmRepository _repository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  _CrmTab _tab = _CrmTab.users;
  List<CrmUser> _users = const <CrmUser>[];
  List<CrmAuditEvent> _auditEvents = const <CrmAuditEvent>[];
  List<CrmGroup> _groups = const <CrmGroup>[];
  bool _isLoading = true;
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

  String? get _wsId => widget.workspaceId;
  final ScrollController _scrollController = ScrollController();
  final ValueNotifier<bool> _alive = ValueNotifier(true);
  bool _searching = false;
  bool _pagingFailed = false;
  CrmUser? _selectedUser;
  CrmUserPermissions? _userPermissions;

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
    _repository =
        widget.repository ?? CrmRepository(expectedUserId: widget.actorId);
    _permissionsRepository =
        widget.permissionsRepository ??
        WorkspacePermissionsRepository(currentUserId: () => widget.actorId);
    _scrollController.addListener(_maybeLoadMore);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _alive.value = false;
    _requestToken++;
    _searchDebounce?.cancel();
    _scrollController.dispose();
    _searchController.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  void _updateState(VoidCallback change) {
    if (mounted) setState(change);
  }

  void _maybeLoadMore() {
    if (_selectedUser == null &&
        !_pagingFailed &&
        _scrollController.hasClients &&
        _scrollController.position.extentAfter < 400) {
      unawaited(_loadMore());
    }
  }

  void _resetSearch() {
    if (!mounted) return;
    _searchDebounce?.cancel();
    if (!_searching && _searchController.text.isEmpty) return;
    _searchController.clear();
    _updateState(() => _searching = false);
    _onSearchChanged('');
  }

  Future<void> _back() async {
    if (_selectedUser != null) {
      _updateState(() => _selectedUser = null);
    } else if (_searching) {
      _resetSearch();
    } else {
      context.go(Routes.apps);
    }
  }

  @override
  Widget build(BuildContext context) => _buildWorkspace(context);
}
