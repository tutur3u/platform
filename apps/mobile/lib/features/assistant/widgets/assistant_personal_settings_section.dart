import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/view/assistant_settings_editor_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_memory_editor.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_editor.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/l10n/l10n.dart';
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
    final provided = context.read<AssistantPersonalSettingsRepository?>();
    final repository = widget.repository ?? provided;
    final owner = repository?.ownerId ?? currentCacheUserId();
    if (owner == null) return;
    _cubit = AssistantPersonalSettingsCubit(
      workspaceId: widget.workspaceId,
      repository:
          repository ?? AssistantPersonalSettingsRepository(ownerId: owner),
      isScopeCurrent: widget.isScopeCurrent,
      currentUserId:
          widget.currentUserId ??
          (provided == null
              ? null
              : () => context.read<AuthCubit?>()?.state.user?.id),
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
        final idle = !state.busy && !state.loading;
        const togglePadding = EdgeInsets.symmetric(
          horizontal: AppLayout.rowHorizontalPadding,
          vertical: AppSpacing.sm,
        );
        if (snapshot == null) {
          return AppGroupedSection.spaced(
            children: [
              if (state.loading)
                const AppSkeletonRows(count: 1)
              else
                AppStateMessage.inline(
                  icon: LucideIcons.cloudOff,
                  tone: AppTone.destructive,
                  title: l.assistantPersonalSettingsError,
                  actionLabel: state.failed ? l.commonRetry : null,
                  onAction: state.failed && !state.busy ? cubit.load : null,
                ),
            ],
          );
        }
        final canEditSoul = cubit.admitted && state.canEditSoul;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppGroupedSection.spaced(
              children: [
                AppGroupedRow(
                  key: const ValueKey('assistant-settings-personality'),
                  leading: const AppIconTile(
                    icon: LucideIcons.sparkles,
                    tone: AppTone.primary,
                  ),
                  title: Text(l.assistantPersonalityTitle),
                  subtitle: Text(
                    snapshot.soul.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  showChevron: canEditSoul,
                  onTap: canEditSoul
                      ? () => pushScopedSettingsPage(
                          context,
                          builder: (_, isCurrent) =>
                              AssistantSettingsEditorPage(
                                title: l.assistantPersonalityTitle,
                                child: AssistantPersonalityEditor(
                                  cubit: cubit,
                                  isScopeCurrent: () =>
                                      isCurrent() && cubit.admitted,
                                ),
                              ),
                        )
                      : null,
                ),
              ],
            ),
            if (snapshot.memoryEnabled != null ||
                snapshot.memories.isNotEmpty ||
                !state.failed)
              AppGroupedSection.spaced(
                caption: l.assistantMemoryTitle,
                footer: snapshot.products['mira'] == false
                    ? l.assistantMemoryProductDisabled
                    : null,
                children: [
                  if (snapshot.memoryEnabled case final enabled?)
                    AppToggleRow(
                      padding: togglePadding,
                      title: Text(l.assistantMemoryCollection),
                      subtitle: Text(l.assistantMemoryWorkspaceScope),
                      value: enabled,
                      onChanged: idle
                          ? (value) => cubit.setMemoryEnabled(enabled: value)
                          : null,
                    )
                  else if (state.loading)
                    const AppSkeletonRows(count: 1)
                  else if (!state.failed)
                    AppStateMessage.inline(
                      icon: LucideIcons.cloudOff,
                      tone: AppTone.destructive,
                      title: l.assistantPersonalSettingsError,
                      actionLabel: l.commonRetry,
                      onAction: cubit.load,
                    ),
                  if (snapshot.memoryEnabled != null &&
                      snapshot.memories.isEmpty)
                    AppStateMessage.inline(
                      icon: LucideIcons.brain,
                      title: l.assistantMemoryEmpty,
                    ),
                  for (final item in snapshot.memories)
                    AppGroupedRow(
                      title: Text(
                        item.text,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: idle
                          ? () => pushScopedSettingsPage(
                              context,
                              builder: (_, isCurrent) =>
                                  AssistantSettingsEditorPage(
                                    title: l.assistantMemoryEditTitle,
                                    child: AssistantMemoryEditor(
                                      settings: cubit,
                                      memoryId: item.id,
                                      isScopeCurrent: isCurrent,
                                    ),
                                  ),
                            )
                          : null,
                      trailing: AppIconButton(
                        tooltip: l.commonDelete,
                        onPressed: idle ? () => _delete(item) : null,
                        icon: const Icon(LucideIcons.trash2),
                      ),
                    ),
                  if (snapshot.memories.isNotEmpty)
                    AppGroupedRow(
                      key: const ValueKey('assistant-memory-export'),
                      leading: const AppIconTile(icon: LucideIcons.share),
                      title: Text(l.assistantMemoryExport),
                      onTap: idle ? _export : null,
                    ),
                ],
              ),
            if (state.failed || _exportFailed)
              Padding(
                padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
                child: AppGroupedCard(
                  children: [
                    AppStateMessage.inline(
                      icon: LucideIcons.triangleAlert,
                      tone: AppTone.destructive,
                      title: l.assistantPersonalSettingsError,
                      actionLabel: state.failed ? l.commonRetry : null,
                      onAction: state.failed && !state.busy ? cubit.load : null,
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}
