import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantPersonalityField {
  name,
  tone,
  verbosity,
  personality,
  boundaries;

  String title(BuildContext context) {
    final l = context.l10n;
    return switch (this) {
      name => l.assistantPersonalityName,
      tone => l.assistantPersonalityTone,
      verbosity => l.assistantPersonalityVerbosity,
      personality => l.assistantPersonalityDescription,
      boundaries => l.assistantPersonalityBoundaries,
    };
  }

  String value(AssistantSoul soul) => switch (this) {
    name => soul.name,
    tone => soul.tone ?? 'balanced',
    verbosity => soul.chatTone ?? 'thorough',
    personality => soul.personality ?? '',
    boundaries => soul.boundaries ?? '',
  };

  AssistantSoul update(AssistantSoul soul, String value) => switch (this) {
    name => soul.copyWith(name: value),
    tone => soul.copyWith(tone: value),
    verbosity => soul.copyWith(chatTone: value),
    personality => soul.copyWith(personality: value),
    boundaries => soul.copyWith(boundaries: value),
  };

  Map<String, String> options(BuildContext context) {
    final l = context.l10n;
    return switch (this) {
      tone => {
        'balanced': l.assistantPersonalityBalanced,
        'warm': l.assistantPersonalityWarm,
        'friendly': l.assistantPersonalityFriendly,
        'casual': l.assistantPersonalityCasual,
        'formal': l.assistantPersonalityFormal,
        'playful': l.assistantPersonalityPlayful,
        'professional': l.assistantPersonalityProfessional,
      },
      verbosity => {
        'thorough': l.assistantPersonalityThorough,
        'concise': l.assistantPersonalityConcise,
        'brief': l.assistantPersonalityBrief,
        'detailed': l.assistantPersonalityDetailed,
      },
      _ => {},
    };
  }
}

class AssistantPersonalityFieldEditor extends StatefulWidget {
  const AssistantPersonalityFieldEditor({
    required this.cubit,
    required this.field,
    required this.isScopeCurrent,
    super.key,
  });
  final AssistantPersonalSettingsCubit cubit;
  final AssistantPersonalityField field;
  final bool Function() isScopeCurrent;
  @override
  State<AssistantPersonalityFieldEditor> createState() =>
      _AssistantPersonalityFieldEditorState();
}

class _AssistantPersonalityFieldEditorState
    extends State<AssistantPersonalityFieldEditor> {
  late final _text = TextEditingController(
    text: widget.field.value(widget.cubit.state.snapshot!.soul),
  );
  final _form = GlobalKey<FormState>();
  bool _saving = false;
  bool _failed = false;
  bool _saved = false;
  bool get _admitted =>
      mounted && widget.isScopeCurrent() && widget.cubit.admitted;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving ||
        _saved ||
        !_admitted ||
        ModalRoute.of(context)?.isCurrent != true ||
        !_form.currentState!.validate()) {
      return;
    }
    final soul = widget.cubit.state.snapshot?.soul;
    if (soul == null) return;
    setState(() {
      _saving = true;
      _failed = false;
    });
    final saved = await widget.cubit.saveSoul(
      widget.field.update(soul, _text.text.trim()),
    );
    if (!mounted || !_admitted) return;
    if (saved && ModalRoute.of(context)?.isCurrent == true) {
      Navigator.of(context).pop();
    } else if (saved) {
      // A covering route stays in place. Returning here acknowledges the
      // confirmed write without submitting the same content again.
      setState(() {
        _saving = false;
        _saved = true;
      });
    } else {
      setState(() {
        _saving = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final field = widget.field;
    final options = field.options(context);
    if (options.isNotEmpty) options.putIfAbsent(_text.text, () => _text.text);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (options.isEmpty)
              TextFormField(
                controller: _text,
                enabled: !_saving && !_saved,
                minLines: field == AssistantPersonalityField.name ? 1 : 3,
                maxLines: field == AssistantPersonalityField.name ? 1 : 8,
                maxLength: field == AssistantPersonalityField.name ? 50 : 2000,
                decoration: InputDecoration(labelText: field.title(context)),
                validator: (value) =>
                    field == AssistantPersonalityField.name &&
                        (value?.trim().isEmpty ?? true)
                    ? l.assistantPersonalityNameRequired
                    : null,
              )
            else
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _text.text,
                decoration: InputDecoration(labelText: field.title(context)),
                items: options.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: _saving || _saved
                    ? null
                    : (value) => _text.text = value!,
              ),
            if (_failed)
              Semantics(
                liveRegion: true,
                child: Text(
                  l.assistantPersonalSettingsError,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: _saving
                  ? null
                  : _saved
                  ? () => Navigator.of(context).pop()
                  : _save,
              child: Text(
                _saving
                    ? l.commonLoading
                    : _saved
                    ? l.commonDone
                    : l.commonSave,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
