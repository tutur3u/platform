part of 'settings_workspace_secrets_page.dart';

class _RolloutSecretDefinition {
  const _RolloutSecretDefinition({
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

class _SecretsHeroPanel extends StatelessWidget {
  const _SecretsHeroPanel({
    required this.workspaceName,
    required this.totalSecrets,
    required this.visibleSecrets,
    required this.activeProvider,
    this.onCreateSecret,
  });

  final String workspaceName;
  final int totalSecrets;
  final int visibleSecrets;
  final String activeProvider;
  final VoidCallback? onCreateSecret;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  Icons.key_rounded,
                  color: theme.colorScheme.primary,
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.settingsWorkspaceSecretsTitle,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      l10n.settingsWorkspaceSecretsPageDescription(
                        workspaceName,
                      ),
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _StatChip(
                label: l10n.settingsWorkspaceSecretsTotalSecrets,
                value: '$totalSecrets',
              ),
              _StatChip(
                label: l10n.settingsWorkspaceSecretsVisibleSecrets,
                value: '$visibleSecrets',
              ),
              _StatChip(
                label: l10n.settingsWorkspaceSecretsActiveBackend,
                value: activeProvider,
              ),
            ],
          ),
          const shad.Gap(16),
          shad.PrimaryButton(
            onPressed: onCreateSecret,
            child: Text(l10n.settingsWorkspaceSecretsCreate),
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(4),
          Text(
            value,
            style: theme.typography.base.copyWith(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _MessagePanel extends StatelessWidget {
  const _MessagePanel({
    required this.icon,
    required this.title,
    required this.description,
    this.action,
  });

  final IconData icon;
  final String title;
  final String description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: theme.colorScheme.mutedForeground, size: 22),
          const shad.Gap(12),
          Text(
            title,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(6),
          Text(
            description,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          if (action != null) ...[
            const shad.Gap(16),
            action!,
          ],
        ],
      ),
    );
  }
}

class _WorkspaceSecretsRolloutPanel extends StatelessWidget {
  const _WorkspaceSecretsRolloutPanel({
    required this.secrets,
    required this.rolloutState,
    required this.onEditSecret,
    required this.onMigrate,
    this.migratingTargetProvider,
  });

  final List<WorkspaceSecret> secrets;
  final WorkspaceStorageRolloutState rolloutState;
  final void Function(_RolloutSecretDefinition definition) onEditSecret;
  final void Function(String sourceProvider, String targetProvider) onMigrate;
  final String? migratingTargetProvider;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final providerSecrets = _providerSecrets(context);
    final proxySecrets = _proxySecrets(context);
    final secretMap = {
      for (final secret in secrets)
        if (secret.name?.isNotEmpty ?? false) secret.name!: secret,
    };
    final providerConfiguredCount = providerSecrets
        .where((definition) => definition.required)
        .where(
          (definition) => (secretMap[definition.name]?.value ?? '').isNotEmpty,
        )
        .length;
    final providerRequiredCount = providerSecrets
        .where((definition) => definition.required)
        .length;
    final recommendedTarget =
        rolloutState.activeProvider == workspaceStorageProviderR2
        ? workspaceStorageProviderSupabase
        : workspaceStorageProviderR2;

    return Column(
      children: [
        SettingsPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.settingsWorkspaceSecretsRolloutTitle,
                style: shad.Theme.of(context).typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const shad.Gap(6),
              Text(
                l10n.settingsWorkspaceSecretsRolloutDescription,
                style: shad.Theme.of(context).typography.textSmall.copyWith(
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _StatChip(
                    label: l10n.settingsWorkspaceSecretsActiveBackend,
                    value: _providerLabel(context, rolloutState.activeProvider),
                  ),
                  _StatChip(
                    label: l10n.settingsWorkspaceSecretsProviderSecrets,
                    value: '$providerConfiguredCount/$providerRequiredCount',
                  ),
                  _StatChip(
                    label: l10n.settingsWorkspaceSecretsZipAutomation,
                    value: rolloutState.autoExtract.enabled
                        ? rolloutState.autoExtract.configured
                              ? l10n.settingsWorkspaceSecretsStateEnabled
                              : l10n.settingsWorkspaceSecretsAutoExtractBlocked
                        : l10n.settingsWorkspaceSecretsStateDisabled,
                  ),
                ],
              ),
              const shad.Gap(18),
              LayoutBuilder(
                builder: (context, constraints) {
                  final useTwoColumns = constraints.maxWidth >= 820;
                  final supabaseCard = _BackendOverviewCard(
                    title: l10n.settingsWorkspaceSecretsProviderSupabaseTitle,
                    description: l10n
                        .settingsWorkspaceSecretsProviderSupabaseDescription,
                    backend: rolloutState.backend(
                      workspaceStorageProviderSupabase,
                    ),
                    isRecommended:
                        recommendedTarget == workspaceStorageProviderSupabase,
                    isMigrating:
                        migratingTargetProvider ==
                        workspaceStorageProviderSupabase,
                    onMigrate: () => onMigrate(
                      workspaceStorageProviderR2,
                      workspaceStorageProviderSupabase,
                    ),
                  );
                  final r2Card = _BackendOverviewCard(
                    title: l10n.settingsWorkspaceSecretsProviderR2Title,
                    description:
                        l10n.settingsWorkspaceSecretsProviderR2Description,
                    backend: rolloutState.backend(workspaceStorageProviderR2),
                    isRecommended:
                        recommendedTarget == workspaceStorageProviderR2,
                    isMigrating:
                        migratingTargetProvider == workspaceStorageProviderR2,
                    onMigrate: () => onMigrate(
                      workspaceStorageProviderSupabase,
                      workspaceStorageProviderR2,
                    ),
                  );

                  if (!useTwoColumns) {
                    return Column(
                      children: [
                        supabaseCard,
                        const shad.Gap(12),
                        r2Card,
                      ],
                    );
                  }

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: supabaseCard),
                      const shad.Gap(12),
                      Expanded(child: r2Card),
                    ],
                  );
                },
              ),
              const shad.Gap(18),
              _AutoExtractPanel(state: rolloutState.autoExtract),
            ],
          ),
        ),
        const shad.Gap(20),
        _QuickSecretsPanel(
          title: l10n.settingsWorkspaceSecretsProviderSecretsTitle,
          description: l10n.settingsWorkspaceSecretsProviderSecretsDescription,
          definitions: providerSecrets,
          secretMap: secretMap,
          onEditSecret: onEditSecret,
        ),
        const shad.Gap(20),
        _QuickSecretsPanel(
          title: l10n.settingsWorkspaceSecretsProxySecretsTitle,
          description: l10n.settingsWorkspaceSecretsProxySecretsDescription,
          definitions: proxySecrets,
          secretMap: secretMap,
          onEditSecret: onEditSecret,
        ),
      ],
    );
  }

  List<_RolloutSecretDefinition> _providerSecrets(BuildContext context) {
    final l10n = context.l10n;
    return [
      _RolloutSecretDefinition(
        name: _driveStorageProviderSecret,
        description:
            l10n.settingsWorkspaceSecretsDriveStorageProviderDescription,
        sensitive: false,
        required: true,
        defaultValue: workspaceStorageProviderSupabase,
      ),
      _RolloutSecretDefinition(
        name: _driveR2BucketSecret,
        description: l10n.settingsWorkspaceSecretsDriveR2BucketDescription,
        sensitive: false,
        required: true,
      ),
      _RolloutSecretDefinition(
        name: _driveR2EndpointSecret,
        description: l10n.settingsWorkspaceSecretsDriveR2EndpointDescription,
        sensitive: false,
        required: true,
      ),
      _RolloutSecretDefinition(
        name: _driveR2AccessKeyIdSecret,
        description: l10n.settingsWorkspaceSecretsDriveR2AccessKeyIdDescription,
        sensitive: true,
        required: true,
      ),
      _RolloutSecretDefinition(
        name: _driveR2SecretAccessKeySecret,
        description:
            l10n.settingsWorkspaceSecretsDriveR2SecretAccessKeyDescription,
        sensitive: true,
        required: true,
      ),
    ];
  }

  List<_RolloutSecretDefinition> _proxySecrets(BuildContext context) {
    final l10n = context.l10n;
    return [
      _RolloutSecretDefinition(
        name: _driveAutoExtractZipSecret,
        description:
            l10n.settingsWorkspaceSecretsDriveAutoExtractZipDescription,
        sensitive: false,
        required: false,
        defaultValue: 'false',
      ),
      _RolloutSecretDefinition(
        name: _driveAutoExtractProxyUrlSecret,
        description:
            l10n.settingsWorkspaceSecretsDriveAutoExtractProxyUrlDescription,
        sensitive: false,
        required: false,
      ),
      _RolloutSecretDefinition(
        name: _driveAutoExtractProxyTokenSecret,
        description:
            l10n.settingsWorkspaceSecretsDriveAutoExtractProxyTokenDescription,
        sensitive: true,
        required: false,
      ),
    ];
  }
}

class _BackendOverviewCard extends StatelessWidget {
  const _BackendOverviewCard({
    required this.title,
    required this.description,
    required this.backend,
    required this.onMigrate,
    required this.isRecommended,
    required this.isMigrating,
  });

  final String title;
  final String description;
  final WorkspaceStorageBackendState? backend;
  final VoidCallback onMigrate;
  final bool isRecommended;
  final bool isMigrating;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final available = backend?.available ?? false;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.75),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                title,
                style: theme.typography.base.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (backend?.selected == true)
                _InlineStatusChip(label: l10n.settingsWorkspaceSecretsSelected),
              if (isRecommended)
                _InlineStatusChip(
                  label: l10n.settingsWorkspaceSecretsRecommended,
                ),
            ],
          ),
          const shad.Gap(6),
          Text(
            description,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(14),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: l10n.settingsWorkspaceSecretsObjects,
                  value: available ? '${backend?.fileCount ?? 0}' : '—',
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: _MetricTile(
                  label: l10n.settingsWorkspaceSecretsInventory,
                  value: available
                      ? _formatBytes(backend?.totalSize ?? 0)
                      : l10n.settingsWorkspaceSecretsUnavailable,
                ),
              ),
            ],
          ),
          const shad.Gap(12),
          Text(
            backend?.message ??
                (available
                    ? l10n.settingsWorkspaceSecretsReadyMessage
                    : l10n.settingsWorkspaceSecretsMissingMessage),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: available && !isMigrating ? onMigrate : null,
            child: isMigrating
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox.square(
                        dimension: 16,
                        child: shad.CircularProgressIndicator(),
                      ),
                      const shad.Gap(8),
                      Text(l10n.settingsWorkspaceSecretsMigrating),
                    ],
                  )
                : Text(l10n.settingsWorkspaceSecretsCopyInto(title)),
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(4),
          Text(
            value,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _InlineStatusChip extends StatelessWidget {
  const _InlineStatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.typography.textSmall.copyWith(
          color: theme.colorScheme.primary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AutoExtractPanel extends StatelessWidget {
  const _AutoExtractPanel({required this.state});

  final WorkspaceStorageAutoExtractState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsWorkspaceSecretsAutoExtractTitle,
      description: l10n.settingsWorkspaceSecretsAutoExtractDescription,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _StatChip(
              label: l10n.settingsWorkspaceSecretsAutoExtractSwitch,
              value: state.enabled
                  ? l10n.settingsWorkspaceSecretsStateEnabled
                  : l10n.settingsWorkspaceSecretsStateDisabled,
            ),
            _StatChip(
              label: l10n.settingsWorkspaceSecretsAutoExtractProxyUrl,
              value: state.proxyUrlConfigured
                  ? l10n.settingsWorkspaceSecretsStatePresent
                  : l10n.settingsWorkspaceSecretsStateMissing,
            ),
            _StatChip(
              label: l10n.settingsWorkspaceSecretsAutoExtractProxyToken,
              value: state.proxyTokenConfigured
                  ? l10n.settingsWorkspaceSecretsStatePresent
                  : l10n.settingsWorkspaceSecretsStateMissing,
            ),
          ],
        ),
      ],
    );
  }
}

class _QuickSecretsPanel extends StatelessWidget {
  const _QuickSecretsPanel({
    required this.title,
    required this.description,
    required this.definitions,
    required this.secretMap,
    required this.onEditSecret,
  });

  final String title;
  final String description;
  final List<_RolloutSecretDefinition> definitions;
  final Map<String, WorkspaceSecret> secretMap;
  final void Function(_RolloutSecretDefinition definition) onEditSecret;

  @override
  Widget build(BuildContext context) {
    return SettingsPanel(
      child: SettingsSection(
        title: title,
        description: description,
        children: definitions
            .map(
              (definition) => _QuickSecretCard(
                definition: definition,
                secret: secretMap[definition.name],
                onEdit: () => onEditSecret(definition),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

class _QuickSecretCard extends StatelessWidget {
  const _QuickSecretCard({
    required this.definition,
    required this.secret,
    required this.onEdit,
  });

  final _RolloutSecretDefinition definition;
  final WorkspaceSecret? secret;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final configured = (secret?.value ?? '').isNotEmpty;
    final displayValue = configured
        ? definition.sensitive
              ? '••••••••'
              : secret!.value!
        : l10n.settingsWorkspaceSecretsNoValue;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  definition.name,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              _InlineStatusChip(
                label: configured
                    ? l10n.settingsWorkspaceSecretsConfigured
                    : l10n.settingsWorkspaceSecretsMissing,
              ),
            ],
          ),
          const shad.Gap(6),
          Text(
            definition.description,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.background.withValues(alpha: 0.72),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: theme.colorScheme.border.withValues(alpha: 0.65),
              ),
            ),
            child: Text(
              displayValue,
              style: theme.typography.textSmall.copyWith(
                fontFamily: 'monospace',
              ),
            ),
          ),
          const shad.Gap(12),
          Row(
            children: [
              Text(
                definition.required
                    ? l10n.settingsWorkspaceSecretsRequired
                    : l10n.settingsWorkspaceSecretsOptional,
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const Spacer(),
              shad.OutlineButton(
                onPressed: onEdit,
                child: Text(
                  configured
                      ? context.l10n.settingsWorkspaceSecretsEdit
                      : context.l10n.settingsWorkspaceSecretsAdd,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SecretsListPanel extends StatelessWidget {
  const _SecretsListPanel({
    required this.controller,
    required this.onCreateSecret,
    required this.child,
  });

  final TextEditingController controller;
  final VoidCallback onCreateSecret;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SettingsSection(
            title: context.l10n.settingsWorkspaceSecretsListTitle,
            description: context.l10n.settingsWorkspaceSecretsListDescription,
            children: [
              shad.TextField(
                controller: controller,
                hintText:
                    context.l10n.settingsWorkspaceSecretsSearchPlaceholder,
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: shad.PrimaryButton(
                  onPressed: onCreateSecret,
                  child: Text(context.l10n.settingsWorkspaceSecretsCreate),
                ),
              ),
            ],
          ),
          const shad.Gap(16),
          child,
        ],
      ),
    );
  }
}

class _WorkspaceSecretCard extends StatelessWidget {
  const _WorkspaceSecretCard({
    required this.secret,
    required this.isUpdating,
    required this.onEdit,
    required this.onDelete,
    this.onToggleBoolean,
  });

  final WorkspaceSecret secret;
  final bool isUpdating;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool>? onToggleBoolean;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final boolValue = secret.value == 'true' || secret.value == 'false';
    final createdAt = secret.createdAt == null
        ? null
        : DateFormat('dd/MM/yyyy, HH:mm').format(secret.createdAt!.toLocal());

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      secret.name ?? '',
                      style: theme.typography.base.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (createdAt != null) ...[
                      const shad.Gap(4),
                      Text(
                        createdAt,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (isUpdating)
                const SizedBox.square(
                  dimension: 18,
                  child: shad.CircularProgressIndicator(),
                ),
            ],
          ),
          const shad.Gap(12),
          if (boolValue)
            Row(
              children: [
                shad.Switch(
                  value: secret.value == 'true',
                  onChanged: onToggleBoolean == null || isUpdating
                      ? null
                      : onToggleBoolean!,
                ),
                const shad.Gap(10),
                Text(
                  secret.value == 'true'
                      ? context.l10n.settingsWorkspaceSecretsStateEnabled
                      : context.l10n.settingsWorkspaceSecretsStateDisabled,
                  style: theme.typography.small,
                ),
              ],
            )
          else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.background.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: theme.colorScheme.border.withValues(alpha: 0.65),
                ),
              ),
              child: Text(
                secret.value?.isNotEmpty == true
                    ? secret.value!
                    : context.l10n.settingsWorkspaceSecretsNoValue,
                style: theme.typography.textSmall.copyWith(
                  fontFamily: 'monospace',
                ),
              ),
            ),
          const shad.Gap(12),
          Row(
            children: [
              shad.GhostButton(
                onPressed: isUpdating ? null : onEdit,
                child: Text(context.l10n.settingsWorkspaceSecretsEdit),
              ),
              const shad.Gap(8),
              shad.GhostButton(
                onPressed: isUpdating ? null : onDelete,
                child: Text(context.l10n.settingsWorkspaceSecretsDeleteTitle),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyStatePanel extends StatelessWidget {
  const _EmptyStatePanel({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.typography.base.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(6),
          Text(
            description,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkspaceSecretEditorSheet extends StatefulWidget {
  const _WorkspaceSecretEditorSheet({
    required this.title,
    required this.onSubmit,
    required this.initialName,
    required this.initialValue,
    this.nameLocked = false,
  });

  final String title;
  final Future<void> Function(String name, String value) onSubmit;
  final String initialName;
  final String initialValue;
  final bool nameLocked;

  @override
  State<_WorkspaceSecretEditorSheet> createState() =>
      _WorkspaceSecretEditorSheetState();
}

class _WorkspaceSecretEditorSheetState
    extends State<_WorkspaceSecretEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _valueController;

  bool _isSaving = false;
  String? _nameError;
  String? _valueError;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName);
    _valueController = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _valueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AppDialogScaffold(
      title: widget.title,
      description: l10n.settingsWorkspaceSecretsEditorDescription,
      icon: Icons.key_rounded,
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : () => unawaited(_handleSave()),
          child: _isSaving
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox.square(
                      dimension: 16,
                      child: shad.CircularProgressIndicator(),
                    ),
                    const shad.Gap(8),
                    Text(l10n.settingsWorkspaceSecretsSaving),
                  ],
                )
              : Text(l10n.settingsWorkspaceSecretsSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _EditorFieldBlock(
            label: l10n.settingsWorkspaceSecretsNameField,
            controller: _nameController,
            hintText: l10n.settingsWorkspaceSecretsNamePlaceholder,
            enabled: !widget.nameLocked,
            error: _nameError,
            maxLines: 1,
          ),
          const shad.Gap(16),
          _EditorFieldBlock(
            label: l10n.settingsWorkspaceSecretsValueField,
            controller: _valueController,
            hintText: l10n.settingsWorkspaceSecretsValuePlaceholder,
            error: _valueError,
            maxLines: 4,
          ),
          if (_submitError != null) ...[
            const shad.Gap(10),
            Text(
              _submitError!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _handleSave() async {
    final l10n = context.l10n;
    final name = _nameController.text.trim();
    final value = _valueController.text.trim();

    setState(() {
      _nameError = name.isEmpty
          ? l10n.settingsWorkspaceSecretsNameRequired
          : null;
      _valueError = value.isEmpty
          ? l10n.settingsWorkspaceSecretsValueRequired
          : null;
      _submitError = null;
    });

    if (_nameError != null || _valueError != null) {
      return;
    }

    setState(() => _isSaving = true);

    try {
      await widget.onSubmit(name, value);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _submitError = error.message.trim().isEmpty
            ? l10n.settingsWorkspaceSecretsSaveError
            : error.message;
        _isSaving = false;
      });
    } on Exception {
      if (!mounted) {
        return;
      }
      setState(() {
        _submitError = l10n.settingsWorkspaceSecretsSaveError;
        _isSaving = false;
      });
    }
  }
}

class _EditorFieldBlock extends StatelessWidget {
  const _EditorFieldBlock({
    required this.label,
    required this.controller,
    required this.hintText,
    required this.maxLines,
    this.enabled = true,
    this.error,
  });

  final String label;
  final TextEditingController controller;
  final String hintText;
  final int maxLines;
  final bool enabled;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.typography.small),
        const shad.Gap(6),
        shad.TextField(
          controller: controller,
          enabled: enabled,
          hintText: hintText,
          keyboardType: TextInputType.multiline,
          maxLines: maxLines,
        ),
        if (error != null) ...[
          const shad.Gap(6),
          Text(
            error!,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.destructive,
            ),
          ),
        ],
      ],
    );
  }
}

String _providerLabel(BuildContext context, String? provider) {
  final l10n = context.l10n;
  return switch (provider) {
    workspaceStorageProviderR2 => l10n.settingsWorkspaceSecretsProviderR2Title,
    _ => l10n.settingsWorkspaceSecretsProviderSupabaseTitle,
  };
}

String _formatBytes(int bytes) {
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
