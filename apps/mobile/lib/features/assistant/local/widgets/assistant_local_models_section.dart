import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/download_network_consent.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_model_tile.dart';
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
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(content: Text(context.l10n.assistantLocalUnavailable)),
        );
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
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(content: Text(context.l10n.assistantLocalUnavailable)),
      );
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
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.assistantLocalTitle,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(l10n.assistantLocalHelp),
            const SizedBox(height: 8),
            Text(l10n.assistantLocalBudgetDescription),
            if (_models.supportsBackgroundDownloads) ...[
              const SizedBox(height: 8),
              Text(l10n.assistantDownloadBackgroundNotice),
            ],
            if (state.loaded && !state.supported) ...[
              const SizedBox(height: 12),
              Text(l10n.assistantLocalHardware),
            ],
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.cloud_outlined),
              title: Text(l10n.assistantLocalRemote),
              subtitle: Text(l10n.assistantLocalRemoteHint),
              trailing: state.loaded && state.selected == null
                  ? const Icon(Icons.check_circle_outline_rounded)
                  : null,
              selected: state.loaded && state.selected == null,
              onTap: state.loaded && !state.busy
                  ? () => unawaited(_models.select(null))
                  : null,
            ),
            if (state.selected != null &&
                !assistantLocalModels.any(
                  (model) => model.id == state.selected,
                ))
              Text(l10n.assistantLocalSelectionUnknown),
            for (final model in assistantLocalModels) ...[
              const Divider(),
              AssistantLocalModelTile(
                model: model,
                installed: state.installed.contains(model.id),
                selected: state.selected == model.id,
                enabled: enabled,
                canRemove: state.loaded && !state.busy && !_picking,
                onInstall: () => unawaited(_install(model)),
                onSelect: () => unawaited(_models.select(model.id)),
                onRemove: () => unawaited(_models.remove(model)),
                onLicense: () => unawaited(_open(Uri.parse(model.licenseUrl))),
                onSource: () => unawaited(
                  _open(
                    Uri.https(
                      'huggingface.co',
                      '/${model.repository}/blob/${model.revision}/${model.filename}',
                    ),
                  ),
                ),
              ),
              if (state.busy && state.modelId == model.id) ...[
                Semantics(
                  label: l10n.assistantLocalLoading,
                  child: LinearProgressIndicator(
                    value: state.total > 0
                        ? (state.received / state.total).clamp(0, 1)
                        : null,
                  ),
                ),
                if (state.operation == LocalModelsOperation.downloading &&
                    _models.supportsBackgroundDownloads)
                  TextButton(
                    onPressed: () => unawaited(
                      state.paused ? _models.resume() : _models.pause(),
                    ),
                    child: Text(
                      state.paused
                          ? l10n.assistantDownloadResume
                          : l10n.assistantDownloadPause,
                    ),
                  ),
                if (state.operation == LocalModelsOperation.downloading ||
                    state.operation == LocalModelsOperation.importing)
                  TextButton(
                    onPressed: _models.cancel,
                    child: Text(l10n.commonCancel),
                  ),
              ],
            ],
            if (state.busy && state.modelId == null)
              Semantics(
                label: l10n.commonLoading,
                child: const LinearProgressIndicator(),
              ),
            if (state.error != null) ...[
              const SizedBox(height: 12),
              Text(_error(context, state.error!)),
              if (!state.loaded)
                TextButton(
                  onPressed: () => unawaited(_models.load()),
                  child: Text(l10n.commonRetry),
                ),
            ],
            const SizedBox(height: 12),
            Text(l10n.assistantLocalModeSwitch),
            const SizedBox(height: 8),
            Text(l10n.assistantLocalHistoryNotice),
          ],
        ),
      );
    },
  );

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
