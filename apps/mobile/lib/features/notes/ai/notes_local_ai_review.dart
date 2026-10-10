import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/notes/ai/notes_local_ai_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class NotesLocalAiReview extends StatefulWidget {
  const NotesLocalAiReview({
    required this.cubit,
    required this.input,
    required this.onAppend,
    super.key,
  });
  final NotesLocalAiCubit cubit;
  final String input;
  final Future<bool> Function(NotesAiScope, String) onAppend;

  @override
  State<NotesLocalAiReview> createState() => _NotesLocalAiReviewState();
}

class _NotesLocalAiReviewState extends State<NotesLocalAiReview> {
  String? _model;
  List<AssistantLocalModel> _models = const [];
  bool _discovering = true;
  bool _saving = false;
  bool _attempted = false;
  bool _saveFailed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_discover());
  }

  Future<void> _discover() async {
    List<AssistantLocalModel> models;
    try {
      models = await widget.cubit.installedModels();
    } on Object {
      models = const [];
    }
    if (!mounted) return;
    setState(() {
      _models = models;
      _model = models.firstOrNull?.id;
      _discovering = false;
    });
  }

  Future<void> _append(NotesAiState state) async {
    if (_attempted || !state.canAppend || state.scope == null) return;
    setState(() {
      _saving = true;
      _attempted = true;
    });
    final accepted = await widget.onAppend(state.scope!, state.output);
    if (!mounted) return;
    if (accepted) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _saving = false;
        _saveFailed = true;
      });
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocBuilder<NotesLocalAiCubit, NotesAiState>(
    bloc: widget.cubit,
    builder: (context, state) {
      final l10n = context.l10n;
      return SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.notesLocalAiTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text(l10n.notesLocalAiDescription),
              const SizedBox(height: 12),
              if (_discovering) const LinearProgressIndicator(),
              if (!_discovering && _models.isEmpty)
                Text(l10n.notesLocalAiMissingModel),
              if (_models.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: _model,
                  decoration: InputDecoration(
                    labelText: l10n.notesLocalAiModel,
                  ),
                  items: [
                    for (final model in _models)
                      DropdownMenuItem(
                        value: model.id,
                        child: Text(model.name),
                      ),
                  ],
                  onChanged: state.busy || _saving || _attempted
                      ? null
                      : (value) {
                          if (value != null) {
                            setState(() => _model = value);
                            unawaited(widget.cubit.invalidate());
                          }
                        },
                ),
              const SizedBox(height: 12),
              if (state.failure != null)
                Text(switch (state.failure!) {
                  NotesAiFailure.missingModel => l10n.notesLocalAiMissingModel,
                  NotesAiFailure.unsupported => l10n.notesLocalAiUnsupported,
                  NotesAiFailure.input => l10n.notesLocalAiInput,
                  _ => l10n.notesLocalAiEngine,
                }),
              if (_saveFailed) Text(l10n.notesLocalAiSaveError),
              if (state.output.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: SelectableText(state.output),
                ),
              FilledButton.icon(
                icon: Icon(
                  state.busy ? Icons.stop_rounded : Icons.auto_awesome_outlined,
                ),
                onPressed: _saving || _attempted || _model == null
                    ? null
                    : state.busy
                    ? () => widget.cubit.invalidate()
                    : () => widget.cubit.generate(_model!, widget.input),
                label: Text(
                  state.busy
                      ? l10n.notesLocalAiStop
                      : l10n.notesLocalAiGenerate,
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.add_rounded),
                onPressed: _saving || _attempted || !state.canAppend
                    ? null
                    : () => _append(state),
                label: Text(l10n.notesLocalAiAppend),
              ),
              TextButton(
                onPressed: _saving ? null : () => Navigator.of(context).pop(),
                child: Text(l10n.notesLocalAiDiscard),
              ),
            ],
          ),
        ),
      );
    },
  );
}
