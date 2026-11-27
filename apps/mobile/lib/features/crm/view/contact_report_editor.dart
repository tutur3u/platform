import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactReportEditor extends StatefulWidget {
  const ContactReportEditor({
    required this.save,
    required this.groups,
    required this.loadMembers,
    this.record,
    super.key,
  });

  final ContactSectionRecord? record;
  final List<CrmGroup> groups;
  final Future<List<CrmGroupMember>> Function(String) loadMembers;
  final Future<void> Function({
    required String? groupId,
    required String? contactId,
    required String title,
    required String content,
    required String feedback,
  })
  save;

  @override
  State<ContactReportEditor> createState() => _ContactReportEditorState();
}

class _ContactReportEditorState extends State<ContactReportEditor> {
  late final _title = TextEditingController(text: widget.record?.title);
  late final _content = TextEditingController(
    text: widget.record?.report?.content,
  );
  late final _feedback = TextEditingController(
    text: widget.record?.report?.feedback,
  );
  String? _groupId;
  String? _contactId;
  List<CrmGroupMember> _members = const [];
  bool _loading = false;
  bool _memberError = false;
  bool _saving = false;
  bool _uncertain = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    _feedback.dispose();
    super.dispose();
  }

  Future<void> _selectGroup(String groupId) async {
    setState(() {
      _groupId = groupId;
      _contactId = null;
      _members = const [];
      _loading = true;
      _memberError = false;
    });
    try {
      final members = await widget.loadMembers(groupId);
      if (mounted && _groupId == groupId) setState(() => _members = members);
    } on Object {
      if (mounted && _groupId == groupId) setState(() => _memberError = true);
    } finally {
      if (mounted && _groupId == groupId) setState(() => _loading = false);
    }
  }

  bool get _canSave =>
      !_saving &&
      !_uncertain &&
      _title.text.trim().isNotEmpty &&
      (widget.record != null || (_groupId != null && _contactId != null));

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.save(
        groupId: _groupId,
        contactId: _contactId,
        title: _title.text.trim(),
        content: _content.text,
        feedback: _feedback.text,
      );
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      _uncertain =
          error.failureKind == ApiFailureKind.transport ||
          error.statusCode >= 500;
      _error = _uncertain
          ? context.l10n.contactsReportSaveUncertain
          : error.message;
    } on Object {
      if (!mounted) return;
      _uncertain = true;
      _error = context.l10n.contactsReportSaveUncertain;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: !_saving,
      child: AppSheetScaffold(
        title: widget.record == null
            ? l10n.contactsReportCreate
            : l10n.contactsReportEdit,
        actions: [
          AppButton.primary(
            onPressed: _canSave ? _save : null,
            child: Text(l10n.commonSave),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (widget.record == null) ...[
              DropdownButtonFormField<String>(
                initialValue: _groupId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.contactsGroups),
                items: [
                  for (final group in widget.groups)
                    DropdownMenuItem(value: group.id, child: Text(group.name)),
                ],
                onChanged: _saving
                    ? null
                    : (value) async {
                        if (value != null && value != _groupId) {
                          await _selectGroup(value);
                        }
                      },
              ),
              if (_loading) const LinearProgressIndicator(),
              if (_memberError)
                TextButton(
                  onPressed: () => _selectGroup(_groupId!),
                  child: Text(l10n.commonRetry),
                ),
              DropdownButtonFormField<String>(
                key: ValueKey(_groupId),
                initialValue: _contactId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.contactsTitle),
                items: [
                  for (final member in _members)
                    DropdownMenuItem(
                      value: member.id,
                      child: Text(member.label),
                    ),
                ],
                onChanged: _saving || _members.isEmpty
                    ? null
                    : (value) => setState(() => _contactId = value),
              ),
            ],
            TextField(
              controller: _title,
              enabled: !_saving && !_uncertain,
              maxLength: 128,
              decoration: InputDecoration(
                labelText: l10n.contactsReportTitle,
                hintText: l10n.contactsReportTitleHint,
              ),
              onChanged: (_) => setState(() {}),
            ),
            TextField(
              controller: _content,
              enabled: !_saving && !_uncertain,
              minLines: 3,
              maxLines: 6,
              maxLength: 100000,
              decoration: InputDecoration(
                labelText: l10n.contactsReportContent,
                hintText: l10n.contactsReportContentHint,
              ),
            ),
            TextField(
              controller: _feedback,
              enabled: !_saving && !_uncertain,
              minLines: 2,
              maxLines: 4,
              maxLength: 100000,
              decoration: InputDecoration(
                labelText: l10n.crmFeedback,
                hintText: l10n.contactsReportFeedbackHint,
              ),
            ),
            if (_error case final error?) Text(error),
          ],
        ),
      ),
    );
  }
}
