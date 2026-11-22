import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_dock_search.dart';
import 'package:mobile/features/settings/view/settings_workspace_member_sheets.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_view.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class SettingsWorkspaceMembersPage extends StatelessWidget {
  const SettingsWorkspaceMembersPage({
    this.repository,
    this.permissionsRepository,
    super.key,
  });

  final WorkspaceManagementRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? WorkspaceManagementRepository(),
      child: _SettingsWorkspaceMembersView(
        permissionsRepository:
            permissionsRepository ?? WorkspacePermissionsRepository(),
      ),
    );
  }
}

class _SettingsWorkspaceMembersView extends StatefulWidget {
  const _SettingsWorkspaceMembersView({required this.permissionsRepository});

  final WorkspacePermissionsRepository permissionsRepository;

  @override
  State<_SettingsWorkspaceMembersView> createState() =>
      _SettingsWorkspaceMembersViewState();
}

class _SettingsWorkspaceMembersViewState
    extends State<_SettingsWorkspaceMembersView> {
  final _searchController = TextEditingController();
  bool _searchActive = false;
  String _query = '';

  bool _loading = true;
  bool _canManageMembers = false;
  bool _canManageRoles = false;
  String? _error;
  int _loadToken = 0;
  List<WorkspaceMemberListItem> _members = const [];
  List<WorkspaceInviteLink> _inviteLinks = const [];
  List<WorkspaceRoleListItem> _roles = const [];

  WorkspaceManagementRepository get _repository =>
      context.read<WorkspaceManagementRepository>();

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    unawaited(_loadData());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canInvite = _canManageMembers && !_loading;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadData()),
      child: NovaRefreshIndicator(
        onRefresh: _loadData,
        child: AppPageListView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            SettingsDockSearch(
              ownerId: 'settings-workspace-members',
              location: Routes.settingsWorkspaceMembers,
              controller: _searchController,
              hint: l10n.settingsWorkspaceMembersSearchPlaceholder,
              active: _searchActive,
              onActiveChanged: (active) =>
                  setState(() => _searchActive = active),
              onChanged: (value) => setState(() => _query = value),
              actions: [
                if (canInvite)
                  ShellActionSpec(
                    id: 'settings-workspace-members-invite',
                    icon: LucideIcons.userPlus,
                    tooltip: l10n.settingsWorkspaceMembersInviteAction,
                    onPressed: () => unawaited(_onInviteMember()),
                  ),
              ],
              fallback: Padding(
                padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
                child: Row(
                  children: [
                    Expanded(
                      child: AppSearchField(
                        controller: _searchController,
                        placeholder:
                            l10n.settingsWorkspaceMembersSearchPlaceholder,
                        onChanged: (value) => setState(() => _query = value),
                      ),
                    ),
                    if (canInvite) ...[
                      const SizedBox(width: AppSpacing.sm),
                      AppIconButton(
                        key: const ValueKey('workspace-members-invite'),
                        variant: AppButtonVariant.primary,
                        tooltip: l10n.settingsWorkspaceMembersInviteAction,
                        icon: const Icon(LucideIcons.userPlus),
                        onPressed: () => unawaited(_onInviteMember()),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            WorkspaceMembersView(
              workspaceId: _wsId ?? '',
              loading: _loading,
              canManage: _canManageMembers,
              error: _error,
              query: _query,
              members: _members,
              inviteLinks: _inviteLinks,
              onRetry: () => unawaited(_loadData()),
              onOpenMember: (member) => unawaited(_onOpenMember(member)),
              onRevokeInvite: (member) => unawaited(_onRemoveMember(member)),
              onCopyLink: (link) => unawaited(_copyLink(link)),
              onDeleteLink: (link) => unawaited(_onRemoveInviteLink(link)),
              onCreateLink: () => unawaited(_onCreateInviteLink()),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadData() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    final token = ++_loadToken;
    if (wsId == null || wsId.isEmpty || workspace?.personal == true) {
      setState(() {
        _loading = false;
        _canManageMembers = false;
      });
      return;
    }
    setState(() {
      _loading = _members.isEmpty;
      _error = null;
    });

    try {
      final repository = _repository;
      final permissions = await widget.permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final canManageMembers = permissions.containsPermission(
        'manage_workspace_members',
      );
      final canManageRoles = permissions.containsPermission(
        manageWorkspaceRolesPermission,
      );
      if (!canManageMembers) {
        if (!mounted || token != _loadToken) return;
        setState(() {
          _loading = false;
          _canManageMembers = false;
          _canManageRoles = canManageRoles;
          _members = const [];
          _inviteLinks = const [];
        });
        return;
      }

      final results = await Future.wait<Object>([
        repository.getMembers(wsId),
        repository.getInviteLinks(wsId),
        if (canManageRoles) repository.getRoles(wsId),
      ]);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _canManageMembers = true;
        _canManageRoles = canManageRoles;
        _members = results[0] as List<WorkspaceMemberListItem>;
        _inviteLinks = results[1] as List<WorkspaceInviteLink>;
        _roles = canManageRoles
            ? results[2] as List<WorkspaceRoleListItem>
            : const [];
      });
    } on Exception catch (error) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _error = describeWorkspaceAdminError(context, error);
      });
    }
  }

  Future<void> _onInviteMember() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = _repository;
    final sent = await showWorkspaceFieldSheet(
      context: context,
      title: l10n.settingsWorkspaceMembersInviteAction,
      icon: LucideIcons.userPlus,
      label: l10n.settingsWorkspaceMembersEmailField,
      placeholder: l10n.settingsWorkspaceMembersEmailPlaceholder,
      submitLabel: l10n.settingsWorkspaceMembersInviteAction,
      keyboardType: TextInputType.emailAddress,
      validate: (value) => _emailPattern.hasMatch(value)
          ? null
          : l10n.settingsWorkspaceMembersEmailInvalid,
      onSubmit: (email) =>
          repository.inviteMember(wsId: wsId, email: email.toLowerCase()),
    );
    if (!sent || !mounted) return;
    showAppToast(
      context,
      message: l10n.settingsWorkspaceMembersInviteSent,
      variant: AppAlertVariant.success,
    );
    await _loadData();
  }

  Future<void> _onCreateInviteLink() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = _repository;
    final created = await showWorkspaceFieldSheet(
      context: context,
      title: l10n.settingsWorkspaceMembersLinkAction,
      icon: LucideIcons.link,
      label: l10n.settingsWorkspaceMembersLinkLimitField,
      placeholder: l10n.settingsWorkspaceMembersLinkLimitPlaceholder,
      submitLabel: l10n.commonCreate,
      keyboardType: TextInputType.number,
      validate: (value) {
        if (value.isEmpty) return null;
        final parsed = int.tryParse(value);
        return parsed == null || parsed <= 0
            ? l10n.settingsWorkspaceMembersLinkLimitInvalid
            : null;
      },
      onSubmit: (value) => repository.createInviteLink(
        wsId: wsId,
        maxUses: value.isEmpty ? null : int.parse(value),
      ),
    );
    if (!created || !mounted) return;
    showAppToast(
      context,
      message: l10n.settingsWorkspaceMembersLinkCreated,
      variant: AppAlertVariant.success,
    );
    await _loadData();
  }

  Future<void> _onOpenMember(WorkspaceMemberListItem member) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = _repository;
    final result = await showAppSheet<WorkspaceMemberSheetResult>(
      context: context,
      builder: (_) => WorkspaceMemberSheet(
        member: member,
        roles: _roles,
        canEditRoles: _canManageRoles,
        canRemove: _canManageMembers && !member.isCreator,
        onSaveRoles: (current, selected) => repository.setMemberRoles(
          wsId: wsId,
          userId: member.id,
          currentRoleIds: current,
          selectedRoleIds: selected,
        ),
      ),
    );
    if (!mounted) return;
    switch (result) {
      case WorkspaceMemberSheetResult.rolesSaved:
        showAppToast(
          context,
          message: l10n.settingsWorkspaceMembersRolesSaved,
          variant: AppAlertVariant.success,
        );
        await _loadData();
      case WorkspaceMemberSheetResult.remove:
        await _onRemoveMember(member);
      case null:
        break;
    }
  }

  Future<void> _copyLink(WorkspaceInviteLink link) async {
    await Clipboard.setData(
      ClipboardData(text: '${ApiConfig.baseUrl}/invite/${link.code}'),
    );
    if (!mounted) return;
    showAppToast(
      context,
      message: context.l10n.settingsWorkspaceMembersLinkCopied,
    );
  }

  Future<void> _onRemoveMember(WorkspaceMemberListItem member) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = _repository;
    final isLeaving =
        !member.pending &&
        member.id == context.read<AuthCubit?>()?.state.user?.id;
    final title = member.pending
        ? l10n.settingsWorkspaceMembersRevokeTitle
        : l10n.settingsWorkspaceMembersRemoveTitle;
    final removed = await showAppAsyncConfirmDialog(
      context: context,
      title: title,
      message: member.pending
          ? l10n.settingsWorkspaceMembersRevokeMessage(
              member.email ?? member.label,
            )
          : l10n.settingsWorkspaceMembersRemoveMessage(member.label),
      confirmLabel: title,
      cancelLabel: l10n.commonCancel,
      describeError: (error) =>
          describeWorkspaceAdminError(context, error, isLeaving: isLeaving),
      onConfirm: () => repository.removeMember(
        wsId: wsId,
        userId: member.pending ? null : member.id,
        email: member.pending ? member.email : null,
      ),
    );
    if (removed && mounted) await _loadData();
  }

  Future<void> _onRemoveInviteLink(WorkspaceInviteLink link) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = _repository;
    final removed = await showAppAsyncConfirmDialog(
      context: context,
      title: l10n.settingsWorkspaceMembersLinkDeleteTitle,
      message: l10n.settingsWorkspaceMembersLinkDeleteMessage,
      confirmLabel: l10n.settingsWorkspaceMembersLinkDeleteTitle,
      cancelLabel: l10n.commonCancel,
      describeError: (error) => describeWorkspaceAdminError(context, error),
      onConfirm: () => repository.deleteInviteLink(wsId: wsId, linkId: link.id),
    );
    if (removed && mounted) await _loadData();
  }
}
