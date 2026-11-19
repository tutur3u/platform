import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Creates or edits a contact group: name, notes, guest flag and dates.
class ContactGroupEditor extends StatefulWidget {
  const ContactGroupEditor({required this.onSubmit, this.group, super.key});

  final CrmGroup? group;
  final Future<void> Function(Map<String, dynamic> payload) onSubmit;

  @override
  State<ContactGroupEditor> createState() => ContactGroupEditorState();
}

class ContactGroupEditorState extends State<ContactGroupEditor> {
  late final TextEditingController _name;
  late final TextEditingController _notes;
  late bool _guest;
  DateTime? _start;
  DateTime? _end;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final group = widget.group;
    _name = TextEditingController(text: group?.name ?? '');
    _notes = TextEditingController(text: group?.notes ?? '');
    _guest = group?.isGuest ?? false;
    _start = DateTime.tryParse(group?.startingDate ?? '');
    _end = DateTime.tryParse(group?.endingDate ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickStart() async {
    final picked = await showAppDatePicker(
      context: context,
      initialDate: _start ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked == null || !mounted) return;
    setState(() => _start = picked);
  }

  Future<void> _pickEnd() async {
    final picked = await showAppDatePicker(
      context: context,
      initialDate: _end ?? _start ?? DateTime.now(),
      firstDate: _start ?? DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked == null || !mounted) return;
    setState(() => _end = picked);
  }

  String? _iso(DateTime? value) {
    if (value == null) return null;
    return DateTime.utc(value.year, value.month, value.day).toIso8601String();
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = l10n.contactsGroupName);
      return;
    }
    if (_start != null &&
        _end != null &&
        DateTime(
          _end!.year,
          _end!.month,
          _end!.day,
        ).isBefore(DateTime(_start!.year, _start!.month, _start!.day))) {
      setState(() => _error = l10n.contactsEndDate);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSubmit({
        'name': name,
        'is_guest': _guest,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'starting_date': _iso(_start),
        'ending_date': _iso(_end),
      });
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) navigator.pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final editing = widget.group != null;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          editing ? l10n.contactsEditGroup : l10n.contactsCreateGroup,
          style: tokens.typography.large.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _name,
          label: l10n.contactsGroupName,
          placeholder: l10n.contactsGroupNameHint,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _notes,
          label: l10n.contactsGroupNotes,
          placeholder: l10n.inputPlaceholderNote,
          minLines: 3,
          maxLines: 5,
        ),
        AppToggleRow(
          value: _guest,
          onChanged: (value) => setState(() => _guest = value),
          title: Text(l10n.contactsGroupGuest),
        ),
        AppGroupedRow(
          title: Text(l10n.contactsStartDate),
          subtitle: Text(_dateLabel(l10n, _start)),
          onTap: _pickStart,
        ),
        AppGroupedRow(
          title: Text(l10n.contactsEndDate),
          subtitle: Text(_dateLabel(l10n, _end)),
          onTap: _pickEnd,
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.md),
          AppStateMessage.inline(
            icon: LucideIcons.circleAlert,
            tone: AppTone.destructive,
            title: l10n.commonSomethingWentWrong,
            message: _error,
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        AppButton.primary(
          key: const ValueKey('contact-group-save'),
          loading: _saving,
          onPressed: _saving ? null : _save,
          child: Text(l10n.commonSave),
        ),
      ],
    );
  }

  String _dateLabel(AppLocalizations l10n, DateTime? value) {
    if (value == null) return l10n.commonSelectDate;
    return MaterialLocalizations.of(context).formatMediumDate(value);
  }
}
