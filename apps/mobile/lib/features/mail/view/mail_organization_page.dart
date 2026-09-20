import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class MailOrganizationPage extends StatefulWidget {
  const MailOrganizationPage({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.kind,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String kind;
  @override
  State<MailOrganizationPage> createState() => _MailOrganizationPageState();
}

class _MailOrganizationPageState extends State<MailOrganizationPage> {
  List<Map<String, dynamic>> _items = [];
  bool _busy = true;
  bool _failed = false;
  bool get _members => widget.kind == 'members';

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final result = _members
          ? await widget.repository.members(
              widget.workspaceId,
              widget.mailboxId,
            )
          : await widget.repository.organization(
              widget.workspaceId,
              widget.mailboxId,
            );
      if (mounted) setState(() => _items = mailRows(result[widget.kind]));
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit([Map<String, dynamic>? item]) async {
    final name = TextEditingController(
      text: item?[_members ? 'email' : 'name'] as String?,
    );
    final description = TextEditingController(
      text: item?['description'] as String?,
    );
    final instructions = TextEditingController(
      text: item?['aiInstructions'] as String?,
    );
    var role = item?['role'] as String? ?? 'viewer';
    var aiEnabled = item?['aiEnabled'] as bool? ?? false;
    var autoApply = item?['aiAutoApply'] as bool? ?? false;
    var saving = false;
    var failed = false;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) {
          final l10n = context.l10n;
          return AlertDialog(
            title: Text(
              _members
                  ? l10n.mailMembers
                  : widget.kind == 'labels'
                  ? l10n.mailLabels
                  : l10n.mailFolders,
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: name,
                    enabled: !saving && (!_members || item == null),
                    decoration: InputDecoration(
                      labelText: _members ? l10n.mailEmail : l10n.mailName,
                    ),
                  ),
                  if (_members)
                    DropdownButtonFormField<String>(
                      initialValue: role,
                      items:
                          {
                                'viewer': l10n.mailViewer,
                                'sender': l10n.mailSender,
                                'admin': l10n.mailAdmin,
                              }.entries
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e.key,
                                  child: Text(e.value),
                                ),
                              )
                              .toList(),
                      onChanged: saving ? null : (v) => update(() => role = v!),
                    ),
                  if (widget.kind == 'labels') ...[
                    TextField(
                      controller: description,
                      enabled: !saving,
                      decoration: InputDecoration(
                        labelText: l10n.mailDescription,
                      ),
                    ),
                    TextField(
                      controller: instructions,
                      enabled: !saving,
                      minLines: 2,
                      maxLines: 5,
                      decoration: InputDecoration(
                        labelText: l10n.mailAiInstructions,
                      ),
                    ),
                    SwitchListTile(
                      title: Text(l10n.mailSmartLabels),
                      value: aiEnabled,
                      onChanged: saving
                          ? null
                          : (v) => update(() {
                              aiEnabled = v;
                              if (!v) autoApply = false;
                            }),
                    ),
                    SwitchListTile(
                      title: Text(l10n.mailAutoApply),
                      value: autoApply,
                      onChanged: saving || !aiEnabled
                          ? null
                          : (v) => update(() => autoApply = v),
                    ),
                  ],
                  if (failed) Text(l10n.commonSomethingWentWrong),
                  if (saving) const NovaLoadingIndicator(size: 20),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: saving
                    ? null
                    : () => Navigator.of(dialogContext).pop(),
                child: Text(l10n.commonCancel),
              ),
              TextButton(
                onPressed: saving
                    ? null
                    : () async {
                        if (name.text.trim().isEmpty) return;
                        update(() {
                          saving = true;
                          failed = false;
                        });
                        try {
                          if (_members) {
                            await widget.repository.saveMember(
                              widget.workspaceId,
                              widget.mailboxId,
                              name.text.trim(),
                              role,
                            );
                          } else {
                            await widget.repository.saveOrganization(
                              widget.workspaceId,
                              widget.mailboxId,
                              widget.kind,
                              {
                                'name': name.text.trim(),
                                if (widget.kind == 'labels') ...{
                                  'description': description.text,
                                  'aiInstructions': instructions.text,
                                  'aiEnabled': aiEnabled,
                                  'aiAutoApply': autoApply,
                                },
                              },
                              id: item?['id'] as String?,
                            );
                          }
                          if (dialogContext.mounted) {
                            Navigator.of(dialogContext).pop();
                          }
                        } on Object {
                          if (context.mounted) {
                            update(() {
                              saving = false;
                              failed = true;
                            });
                          }
                        }
                      },
                child: Text(l10n.commonSave),
              ),
            ],
          );
        },
      ),
    );
    name.dispose();
    description.dispose();
    instructions.dispose();
    if (mounted) await _load();
  }

  Future<void> _remove(Map<String, dynamic> item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.commonDelete),
        content: Text(context.l10n.mailDeleteConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      if (_members) {
        await widget.repository.removeMember(
          widget.workspaceId,
          widget.mailboxId,
          item['userId'] as String,
        );
      } else {
        await widget.repository.deleteOrganization(
          widget.workspaceId,
          widget.mailboxId,
          widget.kind,
          item['id'] as String,
        );
      }
      if (mounted) await _load();
    } on Object {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _members
              ? l10n.mailMembers
              : widget.kind == 'labels'
              ? l10n.mailLabels
              : l10n.mailFolders,
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _busy ? null : _edit,
        tooltip: l10n.commonCreate,
        child: const Icon(Icons.add),
      ),
      body: _busy
          ? const Center(child: NovaLoadingIndicator(size: 20))
          : _failed
          ? Center(
              child: TextButton(
                onPressed: _load,
                child: Text(l10n.commonRetry),
              ),
            )
          : ListView(
              padding: const EdgeInsets.only(bottom: 100),
              children: [
                for (final item in _items)
                  ListTile(
                    title: Text(
                      item[_members ? 'email' : 'name'] as String? ?? '',
                    ),
                    subtitle: _members ? Text(item['role'] as String) : null,
                    onTap: item['kind'] == 'system' || item['role'] == 'owner'
                        ? null
                        : () => _edit(item),
                    trailing:
                        item['kind'] == 'system' || item['role'] == 'owner'
                        ? null
                        : IconButton(
                            tooltip: l10n.commonDelete,
                            onPressed: () => _remove(item),
                            icon: const Icon(Icons.delete_outline),
                          ),
                  ),
              ],
            ),
    );
  }
}
