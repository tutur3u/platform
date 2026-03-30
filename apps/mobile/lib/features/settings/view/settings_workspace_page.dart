import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart'
    show WorkspacePermissionsRepository, manageWorkspaceSettingsPermission;
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/settings/view/workspace_properties_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsWorkspacePage extends StatefulWidget {
  const SettingsWorkspacePage({super.key});

  @override
  State<SettingsWorkspacePage> createState() => _SettingsWorkspacePageState();
}

class _SettingsWorkspacePageState extends State<SettingsWorkspacePage> {
  late final WorkspacePermissionsRepository _workspacePermissionsRepository;
  int _workspacePermissionLoadToken = 0;
  bool _canManageWorkspaceSettings = false;
  bool _isWorkspacePermissionLoading = false;

  @override
  void initState() {
    super.initState();
    _workspacePermissionsRepository = WorkspacePermissionsRepository();
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    unawaited(_loadWorkspaceSettingsPermission(workspace));
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(
      context.deviceClass,
    );
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            unawaited(_loadWorkspaceSettingsPermission(state.currentWorkspace));
          },
        ),
      ],
      child: shad.Scaffold(
        child: RefreshIndicator.adaptive(
          onRefresh: () => _refresh(context),
          child: ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(
              context.deviceClass,
            ),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                20,
                horizontalPadding,
                32,
              ),
              children: [
                SettingsWorkspaceSection(
                  onSelectCurrentWorkspace: () => showWorkspacePickerSheet(
                    context,
                  ),
                  onSelectDefaultWorkspace: () => showWorkspacePickerSheet(
                    context,
                    mode: WorkspacePickerMode.defaultWorkspace,
                  ),
                  canEditWorkspaceProperties: _canManageWorkspaceSettings,
                  isWorkspacePermissionLoading: _isWorkspacePermissionLoading,
                  onEditWorkspaceProperties: (workspace) => unawaited(
                    _showWorkspacePropertiesDialog(workspace),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refresh(BuildContext context) async {
    final workspaceCubit = context.read<WorkspaceCubit>();
    await workspaceCubit.loadWorkspaces();
    if (!mounted) {
      return;
    }
    await _loadWorkspaceSettingsPermission(
      workspaceCubit.state.currentWorkspace,
    );
  }

  Future<void> _loadWorkspaceSettingsPermission(Workspace? workspace) async {
    final workspaceId = workspace?.id;
    final isPersonalWorkspace = workspace?.personal ?? false;
    final token = ++_workspacePermissionLoadToken;

    if (workspaceId == null || workspaceId.isEmpty) {
      if (!mounted) {
        return;
      }
      setState(() {
        _canManageWorkspaceSettings = false;
        _isWorkspacePermissionLoading = false;
      });
      return;
    }

    if (isPersonalWorkspace) {
      if (!mounted) {
        return;
      }
      setState(() {
        _canManageWorkspaceSettings = true;
        _isWorkspacePermissionLoading = false;
      });
      return;
    }

    if (mounted) {
      setState(() {
        _isWorkspacePermissionLoading = true;
      });
    }

    final permissions = await _workspacePermissionsRepository.getPermissions(
      wsId: workspaceId,
    );
    if (!mounted || token != _workspacePermissionLoadToken) {
      return;
    }
    setState(() {
      _canManageWorkspaceSettings = permissions.containsPermission(
        manageWorkspaceSettingsPermission,
      );
      _isWorkspacePermissionLoading = false;
    });
  }

  Future<void> _showWorkspacePropertiesDialog(Workspace workspace) async {
    if (_isWorkspacePermissionLoading || !_canManageWorkspaceSettings) {
      return;
    }

    await showWorkspacePropertiesDialog(context, workspace: workspace);
  }
}
