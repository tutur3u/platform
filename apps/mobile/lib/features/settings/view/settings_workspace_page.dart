import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/supported_currencies.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart'
    show
        WorkspacePermissions,
        WorkspacePermissionsRepository,
        manageWorkspaceSettingsPermission;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/settings/view/workspace_properties_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsWorkspacePage extends StatefulWidget {
  const SettingsWorkspacePage({super.key});

  @override
  State<SettingsWorkspacePage> createState() => _SettingsWorkspacePageState();
}

class _SettingsWorkspacePageState extends State<SettingsWorkspacePage> {
  late final WorkspacePermissionsRepository _workspacePermissionsRepository;
  late final FinanceRepository _financeRepository;
  int _workspacePermissionLoadToken = 0;
  int _workspaceCurrencyLoadToken = 0;
  bool _canManageWorkspaceSettings = false;
  bool _canManageWorkspaceMembers = false;
  bool _canManageWorkspaceSecrets = false;
  bool _canManageWorkspaceRoles = false;
  bool _isWorkspacePermissionLoading = false;
  bool _isWorkspaceCurrencyLoading = true;
  String? _workspaceDefaultCurrency;

  @override
  void initState() {
    super.initState();
    _workspacePermissionsRepository = WorkspacePermissionsRepository();
    _financeRepository = FinanceRepository();
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    unawaited(_loadWorkspaceSettingsPermission(workspace));
    unawaited(_loadWorkspaceDefaultCurrency(workspace));
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
            unawaited(_loadWorkspaceDefaultCurrency(state.currentWorkspace));
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
                  defaultCurrency: _workspaceDefaultCurrency,
                  canEditWorkspaceDefaultCurrency: _canManageWorkspaceSettings,
                  isWorkspaceCurrencyLoading: _isWorkspaceCurrencyLoading,
                  onEditWorkspaceDefaultCurrency: () => unawaited(
                    _showWorkspaceDefaultCurrencyEditor(),
                  ),
                  canManageWorkspaceMembers: _canManageWorkspaceMembers,
                  canManageWorkspaceSecrets: _canManageWorkspaceSecrets,
                  canManageWorkspaceRoles: _canManageWorkspaceRoles,
                  onOpenWorkspaceSecrets: () =>
                      context.push(Routes.settingsWorkspaceSecrets),
                  onOpenWorkspaceMembers: () =>
                      context.push(Routes.settingsWorkspaceMembers),
                  onOpenWorkspaceRoles: () =>
                      context.push(Routes.settingsWorkspaceRoles),
                  showWorkspaceAccess:
                      !(context
                              .read<WorkspaceCubit>()
                              .state
                              .currentWorkspace
                              ?.personal ??
                          false),
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
    await workspaceCubit.loadWorkspaces(forceRefresh: true);
    if (!mounted) {
      return;
    }
    await _loadWorkspaceSettingsPermission(
      workspaceCubit.state.currentWorkspace,
    );
    if (!mounted) {
      return;
    }
    await _loadWorkspaceDefaultCurrency(workspaceCubit.state.currentWorkspace);
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
        _canManageWorkspaceMembers = false;
        _canManageWorkspaceSecrets = false;
        _canManageWorkspaceRoles = false;
        _isWorkspacePermissionLoading = false;
      });
      return;
    }

    if (isPersonalWorkspace) {
      final rootPermissions = await _workspacePermissionsRepository
          .getPermissions(wsId: rootWorkspaceId);
      if (!mounted || token != _workspacePermissionLoadToken) {
        return;
      }
      if (!mounted) {
        return;
      }
      setState(() {
        _canManageWorkspaceSettings = true;
        _canManageWorkspaceMembers = false;
        _canManageWorkspaceSecrets = rootPermissions.containsPermission(
          'manage_workspace_secrets',
        );
        _canManageWorkspaceRoles = true;
        _isWorkspacePermissionLoading = false;
      });
      return;
    }

    if (mounted) {
      setState(() {
        _isWorkspacePermissionLoading = true;
      });
    }

    final workspacePermissionsFuture = _workspacePermissionsRepository
        .getPermissions(wsId: workspaceId);
    final rootPermissionsFuture = workspaceId == rootWorkspaceId
        ? workspacePermissionsFuture
        : _workspacePermissionsRepository.getPermissions(wsId: rootWorkspaceId);
    final permissions = await Future.wait<WorkspacePermissions>([
      workspacePermissionsFuture,
      rootPermissionsFuture,
    ]);
    if (!mounted || token != _workspacePermissionLoadToken) {
      return;
    }
    final workspacePermissions = permissions[0];
    final rootPermissions = permissions[1];
    setState(() {
      _canManageWorkspaceSettings = workspacePermissions.containsPermission(
        manageWorkspaceSettingsPermission,
      );
      _canManageWorkspaceMembers = workspacePermissions.containsPermission(
        'manage_workspace_members',
      );
      _canManageWorkspaceSecrets = rootPermissions.containsPermission(
        'manage_workspace_secrets',
      );
      _canManageWorkspaceRoles = workspacePermissions.containsPermission(
        'manage_workspace_roles',
      );
      _isWorkspacePermissionLoading = false;
    });
  }

  Future<void> _loadWorkspaceDefaultCurrency(Workspace? workspace) async {
    final workspaceId = workspace?.id;
    final token = ++_workspaceCurrencyLoadToken;

    if (workspaceId == null || workspaceId.isEmpty) {
      if (!mounted) {
        return;
      }
      setState(() {
        _workspaceDefaultCurrency = null;
        _isWorkspaceCurrencyLoading = false;
      });
      return;
    }

    if (mounted) {
      setState(() {
        _isWorkspaceCurrencyLoading = true;
      });
    }

    final currency = await _financeRepository.getWorkspaceDefaultCurrency(
      workspaceId,
    );

    if (!mounted || token != _workspaceCurrencyLoadToken) {
      return;
    }

    setState(() {
      _workspaceDefaultCurrency = currency;
      _isWorkspaceCurrencyLoading = false;
    });
  }

  Future<void> _showWorkspacePropertiesDialog(Workspace workspace) async {
    if (_isWorkspacePermissionLoading || !_canManageWorkspaceSettings) {
      return;
    }

    await showWorkspacePropertiesDialog(context, workspace: workspace);
  }

  Future<void> _showWorkspaceDefaultCurrencyEditor() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final workspaceId = workspace?.id;
    if (workspaceId == null ||
        workspaceId.isEmpty ||
        _workspaceDefaultCurrency == null ||
        _isWorkspacePermissionLoading ||
        !_canManageWorkspaceSettings) {
      return;
    }

    final updated = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => _WorkspaceDefaultCurrencyEditorPage(
        wsId: workspaceId,
        repository: _financeRepository,
        initialCurrency: _workspaceDefaultCurrency!,
      ),
    );

    if (updated == true && mounted) {
      await _loadWorkspaceDefaultCurrency(workspace);
    }
  }
}

class _WorkspaceDefaultCurrencyEditorPage extends StatefulWidget {
  const _WorkspaceDefaultCurrencyEditorPage({
    required this.wsId,
    required this.repository,
    required this.initialCurrency,
  });

  final String wsId;
  final FinanceRepository repository;
  final String initialCurrency;

  @override
  State<_WorkspaceDefaultCurrencyEditorPage> createState() =>
      _WorkspaceDefaultCurrencyEditorPageState();
}

class _WorkspaceDefaultCurrencyEditorPageState
    extends State<_WorkspaceDefaultCurrencyEditorPage> {
  late String _selectedCurrency;
  bool _saving = false;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _selectedCurrency = widget.initialCurrency.toUpperCase();
  }

  Future<void> _pickCurrency() async {
    final selection = await showFinanceModal<String>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: context.l10n.settingsWorkspaceDefaultCurrencyTitle,
        child: ListView.separated(
          itemCount: supportedCurrencies.length,
          separatorBuilder: (_, _) => const shad.Gap(8),
          itemBuilder: (context, index) {
            final currency = supportedCurrencies[index];
            return FinancePickerTile(
              title: currency.code,
              subtitle: currency.name,
              isSelected: currency.code == _selectedCurrency,
              onTap: () => Navigator.of(context).pop(currency.code),
            );
          },
        ),
      ),
    );

    if (!mounted || selection == null) {
      return;
    }

    setState(() {
      _selectedCurrency = selection;
      _formError = null;
    });
  }

  Future<void> _save() async {
    if (_saving) {
      return;
    }

    setState(() {
      _saving = true;
      _formError = null;
    });

    try {
      await widget.repository.updateWorkspaceDefaultCurrency(
        wsId: widget.wsId,
        currency: _selectedCurrency,
      );
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _formError = error.message;
      });
    } on Exception catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _formError = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = getSupportedCurrency(_selectedCurrency);
    return FinanceFullscreenFormScaffold(
      title: context.l10n.settingsWorkspaceDefaultCurrencyTitle,
      primaryActionLabel: context.l10n.settingsWorkspaceRolesSave,
      isSaving: _saving,
      onPrimaryPressed: _save,
      child: ListView(
        physics: const BouncingScrollPhysics(),
        children: [
          FinanceFormSection(
            title: context.l10n.settingsWorkspaceDefaultCurrencyField,
            subtitle: context.l10n.settingsWorkspaceDefaultCurrencyDescription,
            child: FinancePickerTile(
              title: selected?.code ?? _selectedCurrency,
              subtitle: selected?.name,
              trailing: const Icon(Icons.unfold_more_rounded, size: 18),
              onTap: _pickCurrency,
            ),
          ),
          if (_formError?.trim().isNotEmpty ?? false) ...[
            const shad.Gap(12),
            Text(
              _formError!,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.destructive,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
