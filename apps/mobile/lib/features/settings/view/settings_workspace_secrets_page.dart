import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/repositories/workspace_secrets_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'settings_workspace_secrets_page_widgets.dart';

const _driveStorageProviderSecret = 'DRIVE_STORAGE_PROVIDER';
const _driveR2BucketSecret = 'DRIVE_R2_BUCKET';
const _driveR2EndpointSecret = 'DRIVE_R2_ENDPOINT';
const _driveR2AccessKeyIdSecret = 'DRIVE_R2_ACCESS_KEY_ID';
const _driveR2SecretAccessKeySecret = 'DRIVE_R2_SECRET_ACCESS_KEY';
const _driveAutoExtractZipSecret = 'DRIVE_AUTO_EXTRACT_ZIP';
const _driveAutoExtractProxyUrlSecret = 'DRIVE_AUTO_EXTRACT_PROXY_URL';
const _driveAutoExtractProxyTokenSecret = 'DRIVE_AUTO_EXTRACT_PROXY_TOKEN';

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

  List<WorkspaceSecret> _secrets = const [];
  WorkspaceStorageRolloutState? _rolloutState;
  String? _error;
  bool _hasAccess = false;
  bool _isLoading = true;
  bool _isWorkspaceEligible = false;
  String? _migratingTargetProvider;
  final Set<String> _updatingSecretIds = <String>{};
  int _loadToken = 0;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? WorkspaceSecretsRepository();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    _searchController.addListener(_handleSearchChanged);
    unawaited(_loadData());
  }

  @override
  void dispose() {
    _searchController
      ..removeListener(_handleSearchChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(
      context.deviceClass,
    );
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
    final filteredSecrets = _filteredSecrets;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => unawaited(_loadData()),
        child: RefreshIndicator.adaptive(
          onRefresh: _loadData,
          child: ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
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
                _SecretsHeroPanel(
                  workspaceName: displayWorkspaceNameOrFallback(
                    context,
                    workspace,
                  ),
                  totalSecrets: _secrets.length,
                  visibleSecrets: filteredSecrets.length,
                  activeProvider: _providerLabel(
                    context,
                    _rolloutState?.activeProvider,
                  ),
                  onCreateSecret: _hasAccess
                      ? () => unawaited(_openSecretEditor())
                      : null,
                ),
                const shad.Gap(20),
                if (_isLoading)
                  const Padding(
                    padding: EdgeInsets.only(top: 36),
                    child: Center(child: NovaLoadingIndicator()),
                  )
                else if (_error != null)
                  _MessagePanel(
                    icon: Icons.error_outline_rounded,
                    title: context.l10n.commonSomethingWentWrong,
                    description: _error!,
                    action: shad.PrimaryButton(
                      onPressed: () => unawaited(_loadData()),
                      child: Text(context.l10n.commonRetry),
                    ),
                  )
                else if (!_isWorkspaceEligible)
                  _MessagePanel(
                    icon: Icons.apartment_outlined,
                    title: context
                        .l10n
                        .settingsWorkspaceSecretsWorkspaceRequiredTitle,
                    description: context
                        .l10n
                        .settingsWorkspaceSecretsWorkspaceRequiredDescription,
                  )
                else if (!_hasAccess)
                  _MessagePanel(
                    icon: Icons.lock_outline_rounded,
                    title:
                        context.l10n.settingsWorkspaceSecretsAccessDeniedTitle,
                    description: context
                        .l10n
                        .settingsWorkspaceSecretsAccessDeniedDescription,
                  )
                else ...[
                  if (_rolloutState != null)
                    _WorkspaceSecretsRolloutPanel(
                      secrets: _secrets,
                      rolloutState: _rolloutState!,
                      migratingTargetProvider: _migratingTargetProvider,
                      onEditSecret: _openRolloutSecretEditor,
                      onMigrate: _migrateStorage,
                    ),
                  if (_rolloutState != null) const shad.Gap(20),
                  _SecretsListPanel(
                    controller: _searchController,
                    onCreateSecret: () => unawaited(_openSecretEditor()),
                    child: filteredSecrets.isEmpty
                        ? _EmptyStatePanel(
                            title:
                                context.l10n.settingsWorkspaceSecretsEmptyTitle,
                            description: context
                                .l10n
                                .settingsWorkspaceSecretsEmptyDescription,
                          )
                        : Column(
                            children: filteredSecrets
                                .map(
                                  (secret) => Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: _WorkspaceSecretCard(
                                      secret: secret,
                                      isUpdating:
                                          secret.id != null &&
                                          _updatingSecretIds.contains(
                                            secret.id,
                                          ),
                                      onToggleBoolean: _isBooleanSecret(secret)
                                          ? (value) => unawaited(
                                              _toggleBooleanSecret(
                                                secret,
                                                value,
                                              ),
                                            )
                                          : null,
                                      onEdit: () => unawaited(
                                        _openSecretEditor(secret: secret),
                                      ),
                                      onDelete: () =>
                                          unawaited(_deleteSecret(secret)),
                                    ),
                                  ),
                                )
                                .toList(growable: false),
                          ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<WorkspaceSecret> get _filteredSecrets {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      return _sortedSecrets(_secrets);
    }

    return _sortedSecrets(
      _secrets
          .where((secret) {
            final name = secret.name?.toLowerCase() ?? '';
            final value = secret.value?.toLowerCase() ?? '';
            return name.contains(query) || value.contains(query);
          })
          .toList(growable: false),
    );
  }

  Future<void> _loadData() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final workspaceId = workspace?.id;
    final token = ++_loadToken;

    if (workspaceId == null ||
        workspaceId.isEmpty ||
        workspace?.personal == true) {
      if (!mounted || token != _loadToken) {
        return;
      }
      setState(() {
        _isLoading = false;
        _isWorkspaceEligible = false;
        _hasAccess = false;
        _error = null;
        _secrets = const [];
        _rolloutState = null;
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
      _isWorkspaceEligible = true;
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

      final workspacePermissions = permissions[0];
      final rootPermissions = permissions[1];
      final hasAccess =
          workspacePermissions.containsPermission('manage_workspace_secrets') ||
          rootPermissions.containsPermission(manageWorkspaceRolesPermission) ||
          rootPermissions.containsPermission('manage_workspace_secrets');

      if (!mounted || token != _loadToken) {
        return;
      }

      if (!hasAccess) {
        setState(() {
          _isLoading = false;
          _hasAccess = false;
          _error = null;
          _secrets = const [];
          _rolloutState = null;
        });
        return;
      }

      final results = await Future.wait<dynamic>([
        _repository.getSecrets(workspaceId),
        _repository.getRolloutState(workspaceId),
      ]);

      if (!mounted || token != _loadToken) {
        return;
      }

      setState(() {
        _isLoading = false;
        _hasAccess = true;
        _error = null;
        _secrets = _sortedSecrets(results[0] as List<WorkspaceSecret>);
        _rolloutState = results[1] as WorkspaceStorageRolloutState;
      });
    } on ApiException catch (error) {
      if (!mounted || token != _loadToken) {
        return;
      }
      setState(() {
        _isLoading = false;
        _error = error.message.trim().isEmpty
            ? context.l10n.settingsWorkspaceSecretsLoadError
            : error.message;
      });
    } on Exception {
      if (!mounted || token != _loadToken) {
        return;
      }
      setState(() {
        _isLoading = false;
        _error = context.l10n.settingsWorkspaceSecretsLoadError;
      });
    }
  }

  Future<void> _refreshDataAfterMutation() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final workspaceId = workspace?.id;

    if (workspaceId == null ||
        workspaceId.isEmpty ||
        workspace?.personal == true ||
        !_hasAccess) {
      return;
    }

    try {
      final results = await Future.wait<dynamic>([
        _repository.getSecrets(workspaceId),
        _repository.getRolloutState(workspaceId),
      ]);

      if (!mounted) {
        return;
      }

      setState(() {
        _secrets = _sortedSecrets(results[0] as List<WorkspaceSecret>);
        _rolloutState = results[1] as WorkspaceStorageRolloutState;
      });
    } on Exception {
      // Keep the current surface stable when background refresh fails.
    }
  }

  Future<void> _openSecretEditor({
    WorkspaceSecret? secret,
    String? lockedName,
    String? initialValue,
  }) async {
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (workspaceId == null || workspaceId.isEmpty) {
      return;
    }

    final result = await showAdaptiveSheet<bool>(
      context: context,
      builder: (_) => _WorkspaceSecretEditorSheet(
        title: secret != null
            ? context.l10n.settingsWorkspaceSecretsEdit
            : context.l10n.settingsWorkspaceSecretsCreate,
        nameLocked: lockedName != null,
        initialName: lockedName ?? secret?.name ?? '',
        initialValue: initialValue ?? secret?.value ?? '',
        onSubmit: (name, value) async {
          if (secret?.id != null) {
            await _repository.updateSecret(
              wsId: workspaceId,
              secretId: secret!.id!,
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
      ),
    );

    if (result == true && mounted) {
      await _refreshDataAfterMutation();
      if (!mounted) {
        return;
      }
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert(
          content: Text(context.l10n.settingsWorkspaceSecretsSaveSuccess),
        ),
      );
    }
  }

  Future<void> _openRolloutSecretEditor(_RolloutSecretDefinition definition) {
    final existing = _findSecret(definition.name);
    return _openSecretEditor(
      secret: existing,
      lockedName: definition.name,
      initialValue: existing?.value ?? definition.defaultValue ?? '',
    );
  }

  Future<void> _deleteSecret(WorkspaceSecret secret) async {
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (workspaceId == null || workspaceId.isEmpty || secret.id == null) {
      return;
    }

    final deleted = await showAdaptiveSheet<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        title: context.l10n.settingsWorkspaceSecretsDeleteTitle,
        message: context.l10n.settingsWorkspaceSecretsDeleteMessage(
          secret.name ?? '',
        ),
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.settingsWorkspaceSecretsDeleteTitle,
        toastContext: context,
        onConfirm: () => _repository.deleteSecret(
          wsId: workspaceId,
          secretId: secret.id!,
        ),
      ),
    );

    if (deleted == true && mounted) {
      await _refreshDataAfterMutation();
      if (!mounted) {
        return;
      }
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert(
          content: Text(context.l10n.settingsWorkspaceSecretsDeleteSuccess),
        ),
      );
    }
  }

  Future<void> _toggleBooleanSecret(WorkspaceSecret secret, bool value) async {
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final secretId = secret.id;
    if (workspaceId == null ||
        workspaceId.isEmpty ||
        secretId == null ||
        secret.name == null) {
      return;
    }

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
        name: secret.name!,
        value: value.toString(),
      );
      await _refreshDataAfterMutation();
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _secrets = previousSecrets);
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty
                ? context.l10n.settingsWorkspaceSecretsSaveError
                : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted) {
        return;
      }
      setState(() => _secrets = previousSecrets);
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.settingsWorkspaceSecretsSaveError),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingSecretIds.remove(secretId));
      }
    }
  }

  Future<void> _migrateStorage(
    String sourceProvider,
    String targetProvider,
  ) async {
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (workspaceId == null || workspaceId.isEmpty) {
      return;
    }

    setState(() => _migratingTargetProvider = targetProvider);

    try {
      final result = await _repository.migrateStorage(
        wsId: workspaceId,
        sourceProvider: sourceProvider,
        targetProvider: targetProvider,
      );
      await _refreshDataAfterMutation();
      if (!mounted) {
        return;
      }
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert(
          content: Text(
            context.l10n.settingsWorkspaceSecretsMigrationSuccess(
              result.filesCopied,
              _providerLabel(context, result.targetProvider),
            ),
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty
                ? context.l10n.settingsWorkspaceSecretsMigrationError
                : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted) {
        return;
      }
      shad.showToast(
        context: context,
        builder: (toastContext, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.settingsWorkspaceSecretsMigrationError),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _migratingTargetProvider = null);
      }
    }
  }

  WorkspaceSecret? _findSecret(String name) {
    for (final secret in _secrets) {
      if (secret.name == name) {
        return secret;
      }
    }
    return null;
  }

  bool _isBooleanSecret(WorkspaceSecret secret) =>
      secret.value == 'true' || secret.value == 'false';

  void _handleSearchChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  List<WorkspaceSecret> _sortedSecrets(List<WorkspaceSecret> secrets) {
    return [...secrets]..sort(
      (left, right) => (left.name ?? '').toLowerCase().compareTo(
        (right.name ?? '').toLowerCase(),
      ),
    );
  }
}
