import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/widgets/assistant_memory_editor.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_editor.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_scoped_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:share_plus/share_plus.dart';

class AssistantPersonalSettingsSection extends StatefulWidget {
  const AssistantPersonalSettingsSection({
    required this.workspaceId,
    required this.isScopeCurrent,
    this.repository,
    this.currentUserId,
    this.shareExport,
    super.key,
  });
  final String workspaceId;
  final bool Function() isScopeCurrent;
  final AssistantPersonalSettingsRepository? repository;
  final String? Function()? currentUserId;
  final Future<void> Function(String)? shareExport;
  @override
  State<AssistantPersonalSettingsSection> createState() =>
      _AssistantPersonalSettingsSectionState();
}

class _AssistantPersonalSettingsSectionState
    extends State<AssistantPersonalSettingsSection> {
  AssistantPersonalSettingsCubit? _cubit;
  bool _exportFailed = false;
  @override
  void initState() {
    super.initState();
    final owner = widget.repository?.ownerId ?? currentCacheUserId();
    if (owner == null) return;
    _cubit = AssistantPersonalSettingsCubit(
      workspaceId: widget.workspaceId,
      repository:
          widget.repository ??
          AssistantPersonalSettingsRepository(ownerId: owner),
      isScopeCurrent: widget.isScopeCurrent,
      currentUserId: widget.currentUserId,
    );
    unawaited(_cubit!.load());
  }

  @override
  void dispose() {
    unawaited(_cubit?.close());
    super.dispose();
  }

  Future<void> _delete(AssistantMemoryItem item) async {
    final cubit = _cubit!;
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.assistantMemoryDeleteTitle,
      description: context.l10n.assistantMemoryDeleteDescription,
      confirmLabel: context.l10n.commonDelete,
      isDestructive: true,
    );
    if (confirmed != true || !mounted || !cubit.admitted) return;
    await cubit.deleteMemory(item.id);
  }

  Future<void> _export() async {
    final cubit = _cubit!;
    setState(() => _exportFailed = false);
    final exported = await cubit.exportMemories();
    if (!mounted || !cubit.admitted || exported == null) return;
    try {
      final text = const JsonEncoder.withIndent('  ').convert(exported);
      if (widget.shareExport case final share?) {
        await share(text);
      } else {
        await SharePlus.instance.share(
          ShareParams(text: text, title: context.l10n.assistantMemoryExport),
        );
      }
    } on Object {
      if (mounted && cubit.admitted) setState(() => _exportFailed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cubit = _cubit;
    if (cubit == null) return const SizedBox.shrink();
    final l = context.l10n;
    return BlocBuilder<
      AssistantPersonalSettingsCubit,
      AssistantPersonalSettingsState
    >(
      bloc: cubit,
      builder: (context, state) {
        final snapshot = state.snapshot;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (state.loading && snapshot == null)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: NovaLoadingIndicator(size: 20)),
              ),
            if (snapshot != null) ...[
              ListTile(
                leading: const Icon(Icons.auto_awesome_outlined),
                title: Text(l.assistantPersonalityTitle),
                subtitle: Text(snapshot.soul.name),
                trailing: const Icon(Icons.chevron_right),
                enabled: !state.busy,
                onTap: () => showScopedSettingsSheet<void>(
                  context: context,
                  builder: (_) => AssistantPersonalityEditor(
                    cubit: cubit,
                    soul: snapshot.soul,
                  ),
                ),
              ),
              ExpansionTile(
                title: Text(l.assistantMemoryTitle),
                leading: const Icon(Icons.psychology_outlined),
                childrenPadding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  if (snapshot.memoryEnabled != null)
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l.assistantMemoryCollection),
                      subtitle: Text(l.assistantMemoryWorkspaceScope),
                      value: snapshot.memoryEnabled!,
                      onChanged: state.busy
                          ? null
                          : (value) => cubit.setMemoryEnabled(enabled: value),
                    ),
                  if (snapshot.products['mira'] == false)
                    Text(l.assistantMemoryProductDisabled),
                  if (snapshot.memoryEnabled == null)
                    Text(l.assistantPersonalSettingsError),
                  if (snapshot.memoryEnabled == null)
                    TextButton(
                      onPressed: cubit.load,
                      child: Text(l.commonRetry),
                    ),
                  if (snapshot.memoryEnabled != null &&
                      snapshot.memories.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(l.assistantMemoryEmpty),
                    ),
                  for (final item in snapshot.memories)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        item.text,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: state.busy
                          ? null
                          : () => showScopedSettingsSheet<void>(
                              context: context,
                              builder: (_) => AssistantMemoryEditor(
                                settings: cubit,
                                memoryId: item.id,
                              ),
                            ),
                      trailing: IconButton(
                        tooltip: l.commonDelete,
                        onPressed: state.busy ? null : () => _delete(item),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: state.busy ? null : _export,
                      icon: const Icon(Icons.ios_share),
                      label: Text(l.assistantMemoryExport),
                    ),
                  ),
                ],
              ),
            ],
            if (state.failed || _exportFailed)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  l.assistantPersonalSettingsError,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (state.failed)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: state.busy ? null : cubit.load,
                  child: Text(l.commonRetry),
                ),
              ),
          ],
        );
      },
    );
  }
}
