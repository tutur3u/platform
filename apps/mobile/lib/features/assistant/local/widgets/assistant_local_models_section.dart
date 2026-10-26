import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/download_network_consent.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_model_downloads.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_model_tile.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_info.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLocalModelsSection extends StatefulWidget {
  const AssistantLocalModelsSection({
    required this.workspaceId,
    required this.isScopeCurrent,
    this.cubit,
    this.connectivity,
    super.key,
  });
  final String workspaceId;
  final bool Function() isScopeCurrent;
  final AssistantLocalModelsCubit? cubit;
  final DownloadConnectivity? connectivity;
  @override
  State<AssistantLocalModelsSection> createState() =>
      _AssistantLocalModelsSectionState();
}

class _AssistantLocalModelsSectionState
    extends State<AssistantLocalModelsSection> {
  late final AssistantLocalModelsCubit _models =
      widget.cubit ??
      AssistantLocalModelsCubit(
        workspaceId: widget.workspaceId,
        isScopeCurrent: widget.isScopeCurrent,
      );
  bool _picking = false;

  @override
  void initState() {
    super.initState();
    unawaited(_models.load());
  }

  @override
  void dispose() {
    unawaited(_models.close());
    super.dispose();
  }

  Future<void> _install(AssistantLocalModel model) async {
    if (!model.requiresLicensedImport) {
      if (_picking || !widget.isScopeCurrent()) return;
      setState(() => _picking = true);
      final consent = await requestDownloadNetworkConsent(
        context,
        connectivity: widget.connectivity,
      );
      if (mounted) setState(() => _picking = false);
      if (!mounted || !widget.isScopeCurrent() || consent == null) return;
      await _models.download(
        model,
        wifiOnly: consent == DownloadNetworkConsent.wifiOnly,
      );
      return;
    }
    if (_picking || !widget.isScopeCurrent()) return;
    setState(() => _picking = true);
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['litertlm'],
      );
      final path = picked.isEmpty ? null : picked.single.path;
      if (!mounted || !widget.isScopeCurrent() || path == null) return;
      await _models.import(model, File(path));
    } on Object {
      if (mounted && widget.isScopeCurrent()) {
        showAppToast(context, message: context.l10n.assistantLocalUnavailable);
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _open(Uri uri) async {
    if (!widget.isScopeCurrent()) return;
    try {
      if (await launchMobileLink(uri)) return;
    } on Object {
      /* Report a generic message without native file/credential details. */
    }
    if (mounted && widget.isScopeCurrent()) {
      showAppToast(context, message: context.l10n.assistantLocalUnavailable);
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocBuilder<AssistantLocalModelsCubit, AssistantLocalModelsState>(
    bloc: _models,
    builder: (context, state) {
      if (!widget.isScopeCurrent()) return const SizedBox.shrink();
      final l10n = context.l10n;
      final enabled =
          state.loaded && state.supported && !state.busy && !_picking;
      final models = assistantLocalModelsForSettings(
        targetSupported: state.supported,
        installed: state.installed,
        activeModelId: state.busy ? state.modelId : null,
      );
      final selectedModel = assistantLocalModels
          .where((model) => model.id == state.selected)
          .firstOrNull;
      final firstInstalled = models
          .where((model) => state.installed.contains(model.id))
          .firstOrNull;
      final remote = state.loaded && state.selected == null;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppGroupedSection.spaced(
            caption: l10n.assistantModelSourceTitle,
            footer: l10n.assistantLocalHelp,
            children: [
              _SourceRow(
                key: const ValueKey('assistant-model-source-remote'),
                icon: LucideIcons.cloud,
                title: l10n.assistantLocalRemote,
                subtitle: l10n.assistantLocalRemoteHint,
                selected: remote,
                onTap: state.loaded && !state.busy
                    ? () => unawaited(_models.select(null))
                    : null,
              ),
              _SourceRow(
                key: const ValueKey('assistant-model-source-local'),
                icon: LucideIcons.cpu,
                title: l10n.assistantLocalHeaderReady,
                subtitle: switch ((selectedModel, state.selected)) {
                  (final model?, _) => model.name,
                  (null, final _?) => l10n.assistantLocalSelectionUnknown,
                  _ when !state.supported && state.loaded =>
                    l10n.assistantLocalUnsupported,
                  _ => l10n.assistantLocalSourceEmpty,
                },
                selected: state.selected != null,
                onTap:
                    enabled && state.selected == null && firstInstalled != null
                    ? () => unawaited(_models.select(firstInstalled.id))
                    : null,
              ),
            ],
          ),
          if (models.isNotEmpty || state.error != null)
            AppGroupedSection.spaced(
              caption: l10n.assistantLocalTitle,
              captionTrailing: AssistantSettingsInfo(
                title: l10n.assistantLocalTitle,
                description: [
                  l10n.assistantLocalBudgetDescription,
                  l10n.assistantLocalHardware,
                  if (_models.supportsBackgroundDownloads)
                    l10n.assistantDownloadBackgroundNotice,
                  l10n.assistantLocalModeSwitch,
                  l10n.assistantLocalHistoryNotice,
                ].join('\n\n'),
              ),
              children: [
                for (final model in models)
                  AssistantLocalModelTile(
                    model: model,
                    installed: state.installed.contains(model.id),
                    selected: state.selected == model.id,
                    enabled: enabled,
                    canRemove: state.loaded && !state.busy && !_picking,
                    progress: state.busy && state.modelId == model.id
                        ? _progress(context, state)
                        : null,
                    onInstall: () => unawaited(_install(model)),
                    onSelect: () => unawaited(_models.select(model.id)),
                    onRemove: () => unawaited(_models.remove(model)),
                    onLicense: () =>
                        unawaited(_open(Uri.parse(model.licenseUrl))),
                    onSource: () => unawaited(
                      _open(
                        Uri.https(
                          'huggingface.co',
                          '/${model.repository}/blob/${model.revision}/${model.filename}',
                        ),
                      ),
                    ),
                  ),
                if (state.busy && state.modelId == null)
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Semantics(
                      label: l10n.commonLoading,
                      child: const LinearProgressIndicator(),
                    ),
                  ),
                if (state.error case final error?)
                  AppStateMessage.inline(
                    icon: LucideIcons.triangleAlert,
                    tone: AppTone.destructive,
                    title: _error(context, error),
                    actionLabel: state.loaded ? null : l10n.commonRetry,
                    onAction: state.loaded
                        ? null
                        : () => unawaited(_models.load()),
                  ),
              ],
            ),
        ],
      );
    },
  );

  Widget _progress(BuildContext context, AssistantLocalModelsState state) {
    final l10n = context.l10n;
    final downloading = state.operation == LocalModelsOperation.downloading;
    final background = downloading && _models.supportsBackgroundDownloads;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (background)
          Text(switch (state.downloadPhase) {
            ModelDownloadPhase.pending => l10n.assistantDownloadPhasePending,
            ModelDownloadPhase.queued => l10n.assistantDownloadPhaseQueued,
            ModelDownloadPhase.transferring =>
              l10n.assistantDownloadPhaseTransferring,
            ModelDownloadPhase.retryWait =>
              l10n.assistantDownloadPhaseRetryWait,
            ModelDownloadPhase.paused => l10n.assistantDownloadPhasePaused,
            ModelDownloadPhase.verifying =>
              l10n.assistantDownloadPhaseVerifying,
          }),
        const SizedBox(height: AppSpacing.xs),
        Semantics(
          label: l10n.assistantLocalLoading,
          child: LinearProgressIndicator(
            value: state.total > 0
                ? (state.received / state.total).clamp(0, 1)
                : null,
          ),
        ),
        Wrap(
          spacing: AppSpacing.sm,
          children: [
            if (background)
              AppButton.ghost(
                onPressed: () => unawaited(
                  state.paused ? _models.resume() : _models.pause(),
                ),
                child: Text(
                  state.paused
                      ? l10n.assistantDownloadResume
                      : l10n.assistantDownloadPause,
                ),
              ),
            if (downloading ||
                state.operation == LocalModelsOperation.importing)
              AppButton.ghost(
                onPressed: _models.cancel,
                child: Text(l10n.commonCancel),
              ),
          ],
        ),
      ],
    );
  }

  String _error(
    BuildContext context,
    LocalModelFailure failure,
  ) => switch (failure) {
    LocalModelFailure.integrity => context.l10n.assistantLocalIntegrity,
    LocalModelFailure.budget => context.l10n.assistantLocalBudget,
    LocalModelFailure.busy => context.l10n.assistantLocalBusy,
    LocalModelFailure.network => context.l10n.assistantDownloadNetworkFailure,
    LocalModelFailure.storage => context.l10n.assistantDownloadStorageFailure,
    LocalModelFailure.authentication =>
      context.l10n.assistantDownloadAdmissionFailure,
    _ => context.l10n.assistantLocalUnavailable,
  };
}

/// One choice of the model source: remote providers or this device.
class _SourceRow extends StatelessWidget {
  const _SourceRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      child: AppGroupedRow(
        leading: AppIconTile(
          icon: icon,
          tone: selected ? AppTone.primary : AppTone.neutral,
        ),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: selected
            ? Icon(LucideIcons.check, size: 20, color: c.primary)
            : null,
        onTap: selected ? null : onTap,
      ),
    );
  }
}
