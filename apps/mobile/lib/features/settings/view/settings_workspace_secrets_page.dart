import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/repositories/workspace_secrets_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/view/settings_dock_search.dart';
import 'package:mobile/features/settings/view/settings_workspace_secret_editor_sheet.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_view.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// Root-workspace secrets: the Drive storage rollout and every workspace
/// secret. Only holders of `manage_workspace_secrets` on the root workspace
/// see values, which stay masked until revealed.
class SettingsWorkspaceSecretsPage extends StatefulWidget {
  const SettingsWorkspaceSecretsPage({
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final WorkspaceSecretsRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<SettingsWorkspaceSecretsPage> createState() =>
      _SettingsWorkspaceSecretsPageState();
}

class _SettingsWorkspaceSecretsPageState
    extends State<SettingsWorkspaceSecretsPage> {
  final _searchController = TextEditingController();
  late final WorkspaceSecretsRepository _repository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  bool _searchActive = false;
  String _query = '';

  List<WorkspaceSecret> _secrets = const [];
  WorkspaceStorageRolloutState? _rolloutState;
  String? _error;
  bool _hasAccess = false;
  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _isWorkspaceEligible = false;
  String? _loadedWorkspaceId;
  String? _migratingTargetProvider;
  final Set<String> _updatingSecretIds = <String>{};
  int _loadToken = 0;

  String? get _workspaceId {
    final id = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    return id == null || id.isEmpty ? null : id;
  }

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? WorkspaceSecretsRepository();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
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
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
    final canCreate = _hasAccess && !_isLoading;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadData(forceRefresh: true)),
      child: NovaRefreshIndicator(
        onRefresh: () => _loadData(forceRefresh: true),
        child: AppPageListView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            SettingsDockSearch(
              ownerId: 'settings-workspace-secrets',
              location: Routes.settingsWorkspaceSecrets,
              controller: _searchController,
              hint: l10n.settingsWorkspaceSecretsSearchPlaceholder,
              active: _searchActive,
              onActiveChanged: (active) =>
                  setState(() => _searchActive = active),
              onChanged: (value) => setState(() => _query = value),
              actions: [
                if (canCreate)
                  ShellActionSpec(
                    id: 'settings-workspace-secrets-create',
                    icon: AppIcons.add,
                    tooltip: l10n.settingsWorkspaceSecretsCreate,
                    onPressed: () => unawaited(_openSecretEditor()),
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
                            l10n.settingsWorkspaceSecretsSearchPlaceholder,
                        onChanged: (value) => setState(() => _query = value),
                      ),
                    ),
                    if (canCreate) ...[
                      const SizedBox(width: AppSpacing.sm),
                      AppIconButton(
                        key: const ValueKey('workspace-secrets-create'),
                        variant: AppButtonVariant.primary,
                        tooltip: l10n.settingsWorkspaceSecretsCreate,
                        icon: const Icon(AppIcons.add),
                        onPressed: () => unawaited(_openSecretEditor()),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (_isRefreshing)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md),
                child: AppLoadingIndicator.inline(),
              ),
            if (_isLoading)
              AppGroupedSection(
                caption: l10n.settingsWorkspaceSecretsListTitle,
                children: const [AppSkeletonRows(count: 4)],
              )
            else if (_error case final error?)
              AppStateMessage(
                icon: LucideIcons.circleAlert,
                tone: AppTone.destructive,
                title: l10n.commonSomethingWentWrong,
                message: error,
                actionLabel: l10n.commonRetry,
                onAction: () => unawaited(_loadData(forceRefresh: true)),
              )
            else if (!_isWorkspaceEligible)
              AppStateMessage(
                icon: LucideIcons.building2,
                title: l10n.settingsWorkspaceSecretsWorkspaceRequiredTitle,
                message:
                    l10n.settingsWorkspaceSecretsWorkspaceRequiredDescription,
              )
            else if (!_hasAccess)
              AppStateMessage(
                icon: LucideIcons.lock,
                title: l10n.settingsWorkspaceSecretsAccessDeniedTitle,
                message: l10n.settingsWorkspaceSecretsAccessDeniedDescription,
              )
            else
              WorkspaceSecretsView(
                workspaceId: workspace?.id ?? '',
                secrets: _secrets,
                rolloutState: _rolloutState,
                query: _query,
                migratingTargetProvider: _migratingTargetProvider,
                updatingSecretIds: _updatingSecretIds,
                onEditDefinition: (definition) =>
                    unawaited(_openDefinitionEditor(definition)),
                onMigrate: (source, target) =>
                    unawaited(_migrateStorage(source, target)),
                onOpenSecret: (secret) => unawaited(_openSecretActions(secret)),
                onToggleBoolean: (secret, value) =>
                    unawaited(_toggleBooleanSecret(secret, value)),
                onCopySecret: (secret) => unawaited(_copySecret(secret)),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final workspaceId = workspace?.id;
    final token = ++_loadToken;

    if (workspaceId == null || workspaceId.isEmpty) {
      if (!mounted || token != _loadToken) {
        return;
      }
      setState(() {
        _isLoading = false;
        _isRefreshing = false;
        _isWorkspaceEligible = false;
        _loadedWorkspaceId = null;
        _hasAccess = false;
        _error = null;
        _secrets = const [];
        _rolloutState = null;
      });
      return;
    }

    final switchingWorkspace =
        _loadedWorkspaceId != null && _loadedWorkspaceId != workspaceId;

    setState(() {
      _isLoading =
          switchingWorkspace || _secrets.isEmpty || _rolloutState == null;
      _isRefreshing = !_isLoading;
      _error = null;
      _isWorkspaceEligible = true;
      if (switchingWorkspace) {
        _loadedWorkspaceId = null;
        _hasAccess = false;
        _secrets = const [];
        _rolloutState = null;
      }
    });

    try {
      final workspacePermissionsFuture = _permissionsRepository.getPermissions(
        wsId: workspaceId,
      );
      final rootPermissionsFuture = workspaceId == rootWorkspaceId
          ? workspacePermissionsFuture
          : _permissionsRepository.getPermissions(wsId: rootWorkspaceId);

      final permissions = await Future.wait<WorkspacePermissions>([
        workspacePermissionsFuture,
        rootPermissionsFuture,
      ]);

      final rootPermissions = permissions[1];
      final hasAccess = rootPermissions.containsPermission(
        'manage_workspace_secrets',
      );

      if (!mounted || token != _loadToken) {
        return;
      }

      if (!hasAccess) {
        setState(() {
          _isLoading = false;
          _isRefreshing = false;
          _loadedWorkspaceId = workspaceId;
          _hasAccess = false;
          _error = null;
          _secrets = const [];
          _rolloutState = null;
        });
        return;
      }

      final cachedSecrets = forceRefresh
          ? null
          : await _repository.readCachedSecrets(workspaceId);
      final cachedRollout = forceRefresh
          ? null
          : await _repository.readCachedRolloutState(workspaceId);
      final hasCachedSecrets =
          cachedSecrets?.hasValue == true && cachedSecrets?.data != null;
      final hasCachedRollout =
          cachedRollout?.hasValue == true && cachedRollout?.data != null;
      final hasResolvedCache = hasCachedSecrets && hasCachedRollout;

      if (!mounted || token != _loadToken) {
        return;
      }

      if (hasResolvedCache) {
        final resolvedCachedSecrets = cachedSecrets?.data;
        final resolvedCachedRollout = cachedRollout?.data;
        if (resolvedCachedSecrets == null || resolvedCachedRollout == null) {
          return;
        }
        setState(() {
          _isLoading = false;
          _isRefreshing = true;
          _loadedWorkspaceId = workspaceId;
          _hasAccess = true;
          _error = null;
          _secrets = resolvedCachedSecrets;
          _rolloutState = resolvedCachedRollout;
        });
      }

      final results = await Future.wait<dynamic>([
        _repository.getSecrets(workspaceId, forceRefresh: true),
        _repository.getRolloutState(workspaceId, forceRefresh: true),
      ]);

      if (!mounted || token != _loadToken) {
        return;
      }

      setState(() {
        _isLoading = false;
        _isRefreshing = false;
        _loadedWorkspaceId = workspaceId;
        _hasAccess = true;
        _error = null;
        _secrets = results[0] as List<WorkspaceSecret>;
        _rolloutState = results[1] as WorkspaceStorageRolloutState;
      });
    } on ApiException catch (error) {
      if (!mounted || token != _loadToken) {
        return;
      }
      final hasDisplayableData = _secrets.isNotEmpty || _rolloutState != null;
      setState(() {
        _isLoading = false;
        _isRefreshing = false;
        _error = hasDisplayableData
            ? null
            : error.message.trim().isEmpty
            ? context.l10n.settingsWorkspaceSecretsLoadError
            : error.message;
      });
    } on Exception {
      if (!mounted || token != _loadToken) {
        return;
      }
      final hasDisplayableData = _secrets.isNotEmpty || _rolloutState != null;
      setState(() {
        _isLoading = false;
        _isRefreshing = false;
        _error = hasDisplayableData
            ? null
            : context.l10n.settingsWorkspaceSecretsLoadError;
      });
    }
  }

  Future<void> _refreshDataAfterMutation() async {
    try {
      await _loadData(forceRefresh: true);
    } on Exception {
      // Keep the current surface stable when background refresh fails.
    }
  }

  String _describeError(Object error, String fallback) =>
      error is ApiException && error.message.trim().isNotEmpty
      ? error.message.trim()
      : fallback;

  Future<void> _openSecretEditor({
    WorkspaceSecret? secret,
    String? lockedName,
    String? initialValue,
  }) async {
    final workspaceId = _workspaceId;
    if (workspaceId == null) return;
    final l10n = context.l10n;
    final saved = await showWorkspaceSecretEditor(
      context: context,
      title: secret != null
          ? l10n.settingsWorkspaceSecretsEdit
          : l10n.settingsWorkspaceSecretsCreate,
      nameLocked: lockedName != null,
      initialName: lockedName ?? secret?.name ?? '',
      initialValue: initialValue ?? secret?.value ?? '',
      onSubmit: (name, value) async {
        if (secret?.id case final secretId?) {
          await _repository.updateSecret(
            wsId: workspaceId,
            secretId: secretId,
            name: name,
            value: value,
          );
          return;
        }
        await _repository.createSecret(
          wsId: workspaceId,
          name: name,
          value: value,
        );
      },
    );
    if (!saved || !mounted) return;
    await _refreshDataAfterMutation();
    if (!mounted) return;
    showAppToast(
      context,
      message: l10n.settingsWorkspaceSecretsSaveSuccess,
      variant: AppAlertVariant.success,
    );
  }

  Future<void> _openDefinitionEditor(WorkspaceSecretDefinition definition) {
    final existing = _findSecret(definition.name);
    return _openSecretEditor(
      secret: existing,
      lockedName: definition.name,
      initialValue: existing?.value ?? definition.defaultValue ?? '',
    );
  }

  Future<void> _openSecretActions(WorkspaceSecret secret) async {
    final l10n = context.l10n;
    await showAppActionSheet<void>(
      context: context,
      title: secret.name ?? '',
      actions: [
        AppSheetAction(
          key: const ValueKey('workspace-secret-action-edit'),
          label: l10n.settingsWorkspaceSecretsEdit,
          icon: LucideIcons.pencil,
          onPressed: () => _openSecretEditor(secret: secret),
        ),
        if ((secret.value ?? '').isNotEmpty)
          AppSheetAction(
            label: l10n.commonCopy,
            icon: LucideIcons.copy,
            onPressed: () => _copySecret(secret),
          ),
        AppSheetAction(
          key: const ValueKey('workspace-secret-action-delete'),
          label: l10n.settingsWorkspaceSecretsDeleteTitle,
          icon: LucideIcons.trash2,
          destructive: true,
          onPressed: () => _deleteSecret(secret),
        ),
      ],
    );
  }

  Future<void> _copySecret(WorkspaceSecret secret) async {
    final value = secret.value;
    if (value == null || value.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    showAppToast(context, message: context.l10n.settingsWorkspaceSecretsCopied);
  }

  Future<void> _deleteSecret(WorkspaceSecret secret) async {
    final workspaceId = _workspaceId;
    final secretId = secret.id;
    if (workspaceId == null || secretId == null) return;
    final l10n = context.l10n;
    final deleted = await showAppAsyncConfirmDialog(
      context: context,
      title: l10n.settingsWorkspaceSecretsDeleteTitle,
      message: l10n.settingsWorkspaceSecretsDeleteMessage(secret.name ?? ''),
      confirmLabel: l10n.settingsWorkspaceSecretsDeleteTitle,
      cancelLabel: l10n.commonCancel,
      describeError: (error) =>
          _describeError(error, l10n.commonSomethingWentWrong),
      onConfirm: () =>
          _repository.deleteSecret(wsId: workspaceId, secretId: secretId),
    );
    if (!deleted || !mounted) return;
    await _refreshDataAfterMutation();
    if (!mounted) return;
    showAppToast(
      context,
      message: l10n.settingsWorkspaceSecretsDeleteSuccess,
      variant: AppAlertVariant.success,
    );
  }

  Future<void> _toggleBooleanSecret(WorkspaceSecret secret, bool value) async {
    final workspaceId = _workspaceId;
    final secretId = secret.id;
    final name = secret.name;
    if (workspaceId == null || secretId == null || name == null) return;
    final l10n = context.l10n;
    final previousSecrets = _secrets;
    setState(() {
      _updatingSecretIds.add(secretId);
      _secrets = _secrets
          .map(
            (item) => item.id == secretId
                ? item.copyWith(value: value.toString())
                : item,
          )
          .toList(growable: false);
    });
    try {
      await _repository.updateSecret(
        wsId: workspaceId,
        secretId: secretId,
        name: name,
        value: value.toString(),
      );
      await _refreshDataAfterMutation();
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _secrets = previousSecrets);
      showAppToast(
        context,
        message: _describeError(error, l10n.settingsWorkspaceSecretsSaveError),
        variant: AppAlertVariant.destructive,
      );
    } finally {
      if (mounted) setState(() => _updatingSecretIds.remove(secretId));
    }
  }

  Future<void> _migrateStorage(
    String sourceProvider,
    String targetProvider,
  ) async {
    final workspaceId = _workspaceId;
    if (workspaceId == null) return;
    final l10n = context.l10n;
    final target = workspaceStorageProviderLabel(context, targetProvider);
    final backend = _rolloutState?.backend(targetProvider);
    WorkspaceStorageMigrationResult? result;
    final confirmed = await showAppAsyncConfirmDialog(
      context: context,
      title: l10n.settingsWorkspaceSecretsCopyInto(target),
      message: backend?.message ?? l10n.settingsWorkspaceSecretsReadyMessage,
      confirmLabel: l10n.settingsWorkspaceSecretsCopyInto(target),
      cancelLabel: l10n.commonCancel,
      destructive: false,
      describeError: (error) =>
          _describeError(error, l10n.settingsWorkspaceSecretsMigrationError),
      onConfirm: () async {
        if (mounted) setState(() => _migratingTargetProvider = targetProvider);
        try {
          result = await _repository.migrateStorage(
            wsId: workspaceId,
            sourceProvider: sourceProvider,
            targetProvider: targetProvider,
          );
        } finally {
          if (mounted) setState(() => _migratingTargetProvider = null);
        }
      },
    );
    final migrated = result;
    if (!confirmed || migrated == null || !mounted) return;
    await _refreshDataAfterMutation();
    if (!mounted) return;
    showAppToast(
      context,
      message: l10n.settingsWorkspaceSecretsMigrationSuccess(
        migrated.filesCopied,
        workspaceStorageProviderLabel(context, migrated.targetProvider),
      ),
      variant: AppAlertVariant.success,
    );
  }

  WorkspaceSecret? _findSecret(String name) {
    for (final secret in _secrets) {
      if (secret.name == name) return secret;
    }
    return null;
  }
}
