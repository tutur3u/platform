import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

const driveStorageProviderSecret = 'DRIVE_STORAGE_PROVIDER';

/// Masked stand-in for a hidden value; its length never reveals the value's.
const workspaceSecretMask = '••••••••';

/// A secret the Drive storage rollout reads, with its editing hints.
class WorkspaceSecretDefinition {
  const WorkspaceSecretDefinition({
    required this.name,
    required this.description,
    required this.sensitive,
    required this.required,
    this.defaultValue,
  });

  final String name;
  final String description;
  final bool sensitive;
  final bool required;
  final String? defaultValue;
}

List<WorkspaceSecretDefinition> workspaceProviderSecrets(
  AppLocalizations l10n,
) => [
  WorkspaceSecretDefinition(
    name: driveStorageProviderSecret,
    description: l10n.settingsWorkspaceSecretsDriveStorageProviderDescription,
    sensitive: false,
    required: true,
    defaultValue: workspaceStorageProviderSupabase,
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_R2_BUCKET',
    description: l10n.settingsWorkspaceSecretsDriveR2BucketDescription,
    sensitive: false,
    required: true,
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_R2_ENDPOINT',
    description: l10n.settingsWorkspaceSecretsDriveR2EndpointDescription,
    sensitive: false,
    required: true,
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_R2_ACCESS_KEY_ID',
    description: l10n.settingsWorkspaceSecretsDriveR2AccessKeyIdDescription,
    sensitive: true,
    required: true,
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_R2_SECRET_ACCESS_KEY',
    description: l10n.settingsWorkspaceSecretsDriveR2SecretAccessKeyDescription,
    sensitive: true,
    required: true,
  ),
];

List<WorkspaceSecretDefinition> workspaceProxySecrets(
  AppLocalizations l10n,
) => [
  WorkspaceSecretDefinition(
    name: 'DRIVE_AUTO_EXTRACT_ZIP',
    description: l10n.settingsWorkspaceSecretsDriveAutoExtractZipDescription,
    sensitive: false,
    required: false,
    defaultValue: 'false',
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_AUTO_EXTRACT_PROXY_URL',
    description:
        l10n.settingsWorkspaceSecretsDriveAutoExtractProxyUrlDescription,
    sensitive: false,
    required: false,
  ),
  WorkspaceSecretDefinition(
    name: 'DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
    description:
        l10n.settingsWorkspaceSecretsDriveAutoExtractProxyTokenDescription,
    sensitive: true,
    required: false,
  ),
];

String workspaceStorageProviderLabel(BuildContext context, String? provider) {
  final l10n = context.l10n;
  return switch (provider) {
    workspaceStorageProviderR2 => l10n.settingsWorkspaceSecretsProviderR2Title,
    _ => l10n.settingsWorkspaceSecretsProviderSupabaseTitle,
  };
}

String formatWorkspaceStorageBytes(int bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var size = bytes.toDouble();
  var unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  final digits = size >= 10 || unitIndex == 0 ? 0 : 1;
  return '${size.toStringAsFixed(digits)} ${units[unitIndex]}';
}

bool isBooleanWorkspaceSecret(WorkspaceSecret secret) =>
    secret.value == 'true' || secret.value == 'false';

/// Secrets whose name or value contains [query], sorted by name.
List<WorkspaceSecret> filterWorkspaceSecrets(
  List<WorkspaceSecret> secrets,
  String query,
) {
  final needle = query.trim().toLowerCase();
  return secrets
      .where(
        (secret) =>
            needle.isEmpty ||
            (secret.name?.toLowerCase().contains(needle) ?? false) ||
            (secret.value?.toLowerCase().contains(needle) ?? false),
      )
      .toList()
    ..sort(
      (a, b) =>
          (a.name ?? '').toLowerCase().compareTo((b.name ?? '').toLowerCase()),
    );
}

/// Storage rollout, rollout secrets and the full secret list.
class WorkspaceSecretsView extends StatelessWidget {
  const WorkspaceSecretsView({
    required this.workspaceId,
    required this.secrets,
    required this.onEditDefinition,
    required this.onMigrate,
    required this.onOpenSecret,
    required this.onToggleBoolean,
    required this.onCopySecret,
    this.rolloutState,
    this.query = '',
    this.migratingTargetProvider,
    this.updatingSecretIds = const {},
    super.key,
  });

  final String workspaceId;
  final List<WorkspaceSecret> secrets;
  final WorkspaceStorageRolloutState? rolloutState;
  final String query;
  final String? migratingTargetProvider;
  final Set<String> updatingSecretIds;
  final ValueChanged<WorkspaceSecretDefinition> onEditDefinition;
  final void Function(String source, String target) onMigrate;
  final ValueChanged<WorkspaceSecret> onOpenSecret;
  final void Function(WorkspaceSecret secret, bool value) onToggleBoolean;
  final ValueChanged<WorkspaceSecret> onCopySecret;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final searching = query.trim().isNotEmpty;
    final filtered = filterWorkspaceSecrets(secrets, query);
    final secretMap = {
      for (final secret in secrets)
        if (secret.name?.isNotEmpty ?? false) secret.name!: secret,
    };
    final rollout = rolloutState;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (rollout != null && !searching) ...[
          _StorageSection(
            state: rollout,
            migratingTargetProvider: migratingTargetProvider,
            onMigrate: onMigrate,
          ),
          for (final (caption, definitions) in [
            (
              l10n.settingsWorkspaceSecretsProviderSecretsTitle,
              workspaceProviderSecrets(l10n),
            ),
            (
              l10n.settingsWorkspaceSecretsProxySecretsTitle,
              workspaceProxySecrets(l10n),
            ),
          ])
            AppGroupedSection.spaced(
              caption: caption,
              children: [
                for (final definition in definitions)
                  _DefinitionRow(
                    definition: definition,
                    secret: secretMap[definition.name],
                    onTap: () => onEditDefinition(definition),
                  ),
              ],
            ),
        ],
        AppGroupedSection(
          caption: l10n.settingsWorkspaceSecretsListTitle,
          children: filtered.isEmpty
              ? [
                  AppStateMessage.inline(
                    icon: searching
                        ? LucideIcons.searchX
                        : LucideIcons.keyRound,
                    title: searching
                        ? l10n.commonNoSearchResults
                        : l10n.settingsWorkspaceSecretsEmptyTitle,
                  ),
                ]
              : [
                  for (final secret in filtered)
                    PendingSyncFrame(
                      workspaceId: workspaceId,
                      entityId: secret.id ?? '',
                      feature: 'settings',
                      child: WorkspaceSecretRow(
                        key: ValueKey('workspace-secret-${secret.id}'),
                        secret: secret,
                        updating: updatingSecretIds.contains(secret.id),
                        onTap: () => onOpenSecret(secret),
                        onCopy: () => onCopySecret(secret),
                        onToggle: (value) => onToggleBoolean(secret, value),
                      ),
                    ),
                ],
        ),
      ],
    );
  }
}

class _StorageSection extends StatelessWidget {
  const _StorageSection({
    required this.state,
    required this.onMigrate,
    this.migratingTargetProvider,
  });

  final WorkspaceStorageRolloutState state;
  final String? migratingTargetProvider;
  final void Function(String source, String target) onMigrate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final recommended = state.activeProvider == workspaceStorageProviderR2
        ? workspaceStorageProviderSupabase
        : workspaceStorageProviderR2;
    final auto = state.autoExtract;
    final autoStatus = !auto.enabled
        ? (
            l10n.settingsWorkspaceSecretsStateDisabled,
            AppBadgeVariant.secondary,
          )
        : auto.configured
        ? (l10n.settingsWorkspaceSecretsStateEnabled, AppBadgeVariant.success)
        : (
            l10n.settingsWorkspaceSecretsAutoExtractBlocked,
            AppBadgeVariant.warning,
          );
    String presence(bool present) => present
        ? l10n.settingsWorkspaceSecretsStatePresent
        : l10n.settingsWorkspaceSecretsStateMissing;
    return AppGroupedSection.spaced(
      caption: l10n.settingsWorkspaceSecretsRolloutTitle,
      children: [
        for (final (provider, icon) in [
          (workspaceStorageProviderSupabase, LucideIcons.database),
          (workspaceStorageProviderR2, LucideIcons.cloud),
        ])
          _BackendRow(
            provider: provider,
            icon: icon,
            backend: state.backend(provider),
            recommended: recommended == provider,
            migrating: migratingTargetProvider == provider,
            busy: migratingTargetProvider != null,
            onMigrate: () => onMigrate(
              provider == workspaceStorageProviderR2
                  ? workspaceStorageProviderSupabase
                  : workspaceStorageProviderR2,
              provider,
            ),
          ),
        AppGroupedRow(
          leading: AppIconTile(
            icon: LucideIcons.fileArchive,
            tone: auto.enabled && auto.configured
                ? AppTone.success
                : AppTone.neutral,
          ),
          title: Text(l10n.settingsWorkspaceSecretsZipAutomation),
          subtitle: Text(
            '${l10n.settingsWorkspaceSecretsAutoExtractProxyUrl}: '
            '${presence(auto.proxyUrlConfigured)} · '
            '${l10n.settingsWorkspaceSecretsAutoExtractProxyToken}: '
            '${presence(auto.proxyTokenConfigured)}',
          ),
          trailing: AppBadge(
            variant: autoStatus.$2,
            child: Text(autoStatus.$1),
          ),
        ),
      ],
    );
  }
}

class _BackendRow extends StatelessWidget {
  const _BackendRow({
    required this.provider,
    required this.icon,
    required this.backend,
    required this.recommended,
    required this.migrating,
    required this.busy,
    required this.onMigrate,
  });

  final String provider;
  final IconData icon;
  final WorkspaceStorageBackendState? backend;
  final bool recommended;
  final bool migrating;
  final bool busy;
  final VoidCallback onMigrate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final available = backend?.available ?? false;
    final selected = backend?.selected ?? false;
    final summary = available
        ? '${l10n.settingsWorkspaceSecretsObjects}: ${backend?.fileCount ?? 0}'
              ' · ${formatWorkspaceStorageBytes(backend?.totalSize ?? 0)}'
        : backend?.message ?? l10n.settingsWorkspaceSecretsMissingMessage;
    return AppGroupedRow(
      key: ValueKey('workspace-storage-$provider'),
      leading: AppIconTile(
        icon: icon,
        tone: selected ? AppTone.primary : AppTone.neutral,
      ),
      title: Text(workspaceStorageProviderLabel(context, provider)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(summary),
          if (selected || recommended) ...[
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              children: [
                if (selected)
                  AppBadge(
                    variant: AppBadgeVariant.primary,
                    child: Text(l10n.settingsWorkspaceSecretsSelected),
                  ),
                if (recommended)
                  AppBadge.outline(
                    child: Text(l10n.settingsWorkspaceSecretsRecommended),
                  ),
              ],
            ),
          ],
        ],
      ),
      trailing: migrating ? const AppLoadingIndicator.inline() : null,
      showChevron: available && !busy,
      onTap: available && !busy ? onMigrate : null,
    );
  }
}

class _DefinitionRow extends StatelessWidget {
  const _DefinitionRow({
    required this.definition,
    required this.secret,
    required this.onTap,
  });

  final WorkspaceSecretDefinition definition;
  final WorkspaceSecret? secret;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = secret?.value ?? '';
    final configured = value.isNotEmpty;
    final (label, variant) = configured
        ? (l10n.settingsWorkspaceSecretsConfigured, AppBadgeVariant.success)
        : definition.required
        ? (l10n.settingsWorkspaceSecretsMissing, AppBadgeVariant.destructive)
        : (l10n.settingsWorkspaceSecretsOptional, AppBadgeVariant.outline);
    return AppGroupedRow(
      key: ValueKey('workspace-secret-definition-${definition.name}'),
      title: Text(
        definition.name,
        style: const TextStyle(fontFamily: 'monospace'),
      ),
      subtitle: Text(
        configured
            ? definition.sensitive
                  ? workspaceSecretMask
                  : value
            : definition.description,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: AppBadge(variant: variant, child: Text(label)),
      onTap: onTap,
    );
  }
}

/// One secret: masked value with reveal and copy, or a switch for boolean
/// values. Each row starts masked.
class WorkspaceSecretRow extends StatefulWidget {
  const WorkspaceSecretRow({
    required this.secret,
    required this.onTap,
    required this.onCopy,
    required this.onToggle,
    this.updating = false,
    super.key,
  });

  final WorkspaceSecret secret;
  final bool updating;
  final VoidCallback onTap;
  final VoidCallback onCopy;
  final ValueChanged<bool> onToggle;

  @override
  State<WorkspaceSecretRow> createState() => _WorkspaceSecretRowState();
}

class _WorkspaceSecretRowState extends State<WorkspaceSecretRow> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final secret = widget.secret;
    final value = secret.value ?? '';
    final boolean = isBooleanWorkspaceSecret(secret);
    final Widget? trailing;
    if (widget.updating) {
      trailing = const AppLoadingIndicator.inline();
    } else if (boolean) {
      trailing = AppSwitch(
        value: value == 'true',
        semanticLabel: secret.name,
        onChanged: widget.onToggle,
      );
    } else if (value.isEmpty) {
      trailing = null;
    } else {
      trailing = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIconButton(
            key: ValueKey('workspace-secret-reveal-${secret.id}'),
            tooltip: _revealed
                ? l10n.settingsWorkspaceSecretsHide
                : l10n.settingsWorkspaceSecretsReveal,
            icon: Icon(_revealed ? LucideIcons.eyeOff : LucideIcons.eye),
            onPressed: () => setState(() => _revealed = !_revealed),
          ),
          AppIconButton(
            key: ValueKey('workspace-secret-copy-${secret.id}'),
            tooltip: l10n.commonCopy,
            icon: const Icon(LucideIcons.copy),
            onPressed: widget.onCopy,
          ),
        ],
      );
    }
    final shown = boolean
        ? value == 'true'
              ? l10n.settingsWorkspaceSecretsStateEnabled
              : l10n.settingsWorkspaceSecretsStateDisabled
        : value.isEmpty
        ? l10n.settingsWorkspaceSecretsNoValue
        : _revealed
        ? value
        : workspaceSecretMask;
    return AppGroupedRow(
      leading: const AppIconTile(icon: LucideIcons.keyRound),
      title: Text(
        secret.name ?? '',
        style: const TextStyle(fontFamily: 'monospace'),
      ),
      subtitle: Text(
        shown,
        maxLines: _revealed ? 6 : 1,
        overflow: TextOverflow.ellipsis,
        style: boolean ? null : const TextStyle(fontFamily: 'monospace'),
      ),
      trailing: trailing,
      onTap: widget.updating ? null : widget.onTap,
    );
  }
}
