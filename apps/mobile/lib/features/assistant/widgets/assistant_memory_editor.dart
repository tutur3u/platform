import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_memory_editor_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class AssistantMemoryEditor extends StatefulWidget {
  const AssistantMemoryEditor({
    required this.settings,
    required this.memoryId,
    super.key,
  });
  final AssistantPersonalSettingsCubit settings;
  final String memoryId;
  @override
  State<AssistantMemoryEditor> createState() => _AssistantMemoryEditorState();
}

class _AssistantMemoryEditorState extends State<AssistantMemoryEditor> {
  final _text = TextEditingController();
  late final _cubit = AssistantMemoryEditorCubit(
    repository: widget.settings.repository,
    workspaceId: widget.settings.workspaceId,
    memoryId: widget.memoryId,
    isScopeCurrent: () =>
        mounted && _route?.isActive == true && widget.settings.admitted,
    onConfirmed: widget.settings.applyConfirmedMemoryEdit,
  );
  bool _initialized = false;
  ModalRoute<dynamic>? _route;
  bool _started = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
    if (!_started) {
      _started = true;
      unawaited(_cubit.load());
    }
  }

  @override
  void dispose() {
    _text.dispose();
    unawaited(_cubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return BlocConsumer<AssistantMemoryEditorCubit, AssistantMemoryEditorState>(
      bloc: _cubit,
      listener: (context, state) {
        if (!_initialized && state.memory != null) {
          _initialized = true;
          _text.text = state.draft;
        }
        if (state.saved &&
            !state.auditWarning &&
            _cubit.admitted &&
            _route?.isCurrent == true) {
          Navigator.of(context).pop();
        }
      },
      builder: (context, state) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 20,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l.assistantMemoryEditTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              if (state.loading && state.memory == null)
                Semantics(
                  label: l.commonLoading,
                  child: const Center(child: NovaLoadingIndicator(size: 20)),
                ),
              if (state.memory != null)
                TextFormField(
                  key: const ValueKey('assistant-memory-edit-field'),
                  controller: _text,
                  minLines: 3,
                  maxLines: 8,
                  maxLength: 20000,
                  onChanged: _cubit.changeDraft,
                  decoration: InputDecoration(
                    labelText: l.assistantMemoryEditText,
                  ),
                ),
              if (state.latestContent != null) ...[
                Text(
                  l.assistantMemoryLatest,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                SelectableText(state.latestContent!),
              ],
              if (state.failure != null)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    switch (state.failure!) {
                      MemoryEditFailure.conflict =>
                        l.assistantMemoryEditConflict,
                      MemoryEditFailure.denied => l.assistantMemoryEditDenied,
                      MemoryEditFailure.missing => l.assistantMemoryEditMissing,
                      MemoryEditFailure.failed =>
                        l.assistantPersonalSettingsError,
                    },
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              if (state.auditWarning)
                Semantics(
                  liveRegion: true,
                  child: Text(l.assistantMemoryEditAuditWarning),
                ),
              if (state.failure != null && !state.saving)
                TextButton(
                  onPressed: state.loading
                      ? null
                      : () => _cubit.load(reviewLatest: state.memory != null),
                  child: Text(
                    state.memory == null
                        ? l.commonRetry
                        : l.assistantMemoryReviewLatest,
                  ),
                ),
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: state.canSave ? _cubit.save : null,
                child: Text(
                  state.saving
                      ? l.commonLoading
                      : state.latestContent != null
                      ? l.assistantMemorySaveChanges
                      : l.commonSave,
                ),
              ),
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: () => Navigator.of(context).pop(),
                child: Text(state.saved ? l.commonDone : l.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
