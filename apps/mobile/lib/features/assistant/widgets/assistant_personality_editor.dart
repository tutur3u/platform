import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantPersonalityEditor extends StatefulWidget {
  const AssistantPersonalityEditor({
    required this.cubit,
    required this.soul,
    super.key,
  });
  final AssistantPersonalSettingsCubit cubit;
  final AssistantSoul soul;
  @override
  State<AssistantPersonalityEditor> createState() =>
      _AssistantPersonalityEditorState();
}

class _AssistantPersonalityEditorState
    extends State<AssistantPersonalityEditor> {
  late final _name = TextEditingController(text: widget.soul.name);
  late final _personality = TextEditingController(
    text: widget.soul.personality,
  );
  late final _boundaries = TextEditingController(text: widget.soul.boundaries);
  late String _tone = widget.soul.tone ?? 'balanced';
  late String _verbosity = widget.soul.chatTone ?? 'thorough';
  bool _saving = false;
  bool _failed = false;
  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _name.dispose();
    _personality.dispose();
    _boundaries.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate() || !widget.cubit.admitted) {
      return;
    }
    setState(() {
      _saving = true;
      _failed = false;
    });
    final saved = await widget.cubit.saveSoul(
      widget.soul.copyWith(
        name: _name.text.trim(),
        tone: _tone,
        chatTone: _verbosity,
        personality: _personality.text.trim(),
        boundaries: _boundaries.text.trim(),
      ),
    );
    if (!mounted) return;
    if (saved) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _saving = false;
      _failed = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tones = {
      'balanced': l.assistantPersonalityBalanced,
      'warm': l.assistantPersonalityWarm,
      'friendly': l.assistantPersonalityFriendly,
      'casual': l.assistantPersonalityCasual,
      'formal': l.assistantPersonalityFormal,
      'playful': l.assistantPersonalityPlayful,
      'professional': l.assistantPersonalityProfessional,
      // Preserve server values outside these presets.
    }..putIfAbsent(_tone, () => _tone);
    final verbosity = {
      'thorough': l.assistantPersonalityThorough,
      'concise': l.assistantPersonalityConcise,
      'brief': l.assistantPersonalityBrief,
      'detailed': l.assistantPersonalityDetailed,
    }..putIfAbsent(_verbosity, () => _verbosity);
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          16,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l.assistantPersonalityTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _name,
                enabled: !_saving,
                maxLength: 50,
                decoration: InputDecoration(
                  labelText: l.assistantPersonalityName,
                ),
                validator: (value) => (value?.trim().isEmpty ?? true)
                    ? l.assistantPersonalityNameRequired
                    : null,
              ),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _tone,
                decoration: InputDecoration(
                  labelText: l.assistantPersonalityTone,
                ),
                items: tones.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: _saving ? null : (value) => _tone = value!,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _verbosity,
                decoration: InputDecoration(
                  labelText: l.assistantPersonalityVerbosity,
                ),
                items: verbosity.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: _saving ? null : (value) => _verbosity = value!,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _personality,
                enabled: !_saving,
                minLines: 2,
                maxLines: 4,
                maxLength: 2000,
                decoration: InputDecoration(
                  labelText: l.assistantPersonalityDescription,
                ),
              ),
              TextFormField(
                controller: _boundaries,
                enabled: !_saving,
                minLines: 2,
                maxLines: 4,
                maxLength: 2000,
                decoration: InputDecoration(
                  labelText: l.assistantPersonalityBoundaries,
                ),
              ),
              if (_failed)
                Text(
                  l.assistantPersonalSettingsError,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? l.commonLoading : l.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
