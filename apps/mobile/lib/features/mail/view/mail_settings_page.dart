import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_organization_page.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class MailSettingsPage extends StatefulWidget {
  const MailSettingsPage({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    this.swipePreferences,
    this.canManage = true,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final MailSwipePreferences? swipePreferences;
  final bool canManage;
  @override
  State<MailSettingsPage> createState() => _MailSettingsPageState();
}

class _MailSettingsPageState extends State<MailSettingsPage> {
  final _sender = TextEditingController();
  final _signature = TextEditingController();
  final _instructions = TextEditingController();
  final _forwardTo = TextEditingController();
  bool _busy = true;
  bool _failed = false;
  bool _autoDraft = false;
  bool _smartLabels = false;
  String _forwarding = 'off';
  String? _provider;
  String _savedSignature = '';
  Map<String, dynamic>? _group;

  @override
  void initState() {
    super.initState();
    MailImagePreference.instance.addListener(_imagePreferenceChanged);
    unawaited(MailImagePreference.instance.load());
    if (widget.canManage) {
      unawaited(_load());
    } else {
      _busy = false;
    }
  }

  void _imagePreferenceChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    MailImagePreference.instance.removeListener(_imagePreferenceChanged);
    for (final c in [_sender, _signature, _instructions, _forwardTo]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final result = await widget.repository.settings(
        widget.workspaceId,
        widget.mailboxId,
      );
      if (!mounted) return;
      final settings = result['settings'] as Map<String, dynamic>;
      final automation = settings['automation'] as Map<String, dynamic>?;
      final forwarding = automation?['forwarding'] as Map<String, dynamic>?;
      _sender.text = settings['senderName'] as String? ?? '';
      _signature.text = settings['signatureText'] as String? ?? '';
      _savedSignature = _signature.text;
      _instructions.text = settings['aiInstructions'] as String? ?? '';
      _forwardTo.text = forwarding?['address'] as String? ?? '';
      setState(() {
        _autoDraft = settings['autoDraftEnabled'] as bool? ?? false;
        _provider = settings['outboundProviderOverride'] as String?;
        _smartLabels = automation?['smartLabelsEnabled'] as bool? ?? false;
        _forwarding = forwarding?['mode'] as String? ?? 'off';
        _group = settings['groupPolicy'] as Map<String, dynamic>?;
      });
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await widget.repository.updateSettings(
        widget.workspaceId,
        widget.mailboxId,
        {
          'senderName': _sender.text.trim(),
          'signatureText': _signature.text,
          if (_signature.text != _savedSignature) 'signatureHtml': null,
          'aiInstructions': _instructions.text,
          'autoDraftEnabled': _autoDraft,
          'outboundProviderOverride': _provider,
          if (_group != null) 'groupPolicy': _group,
          if (_group == null)
            'automation': {
              'smartLabelsEnabled': _smartLabels,
              'forwarding': {
                'mode': _forwarding,
                if (_forwarding == 'mailbox') 'address': _forwardTo.text.trim(),
              },
            },
        },
      );
      if (mounted) Navigator.of(context).pop();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.mailSettings),
        actions: [
          if (widget.canManage)
            IconButton(
              tooltip: l10n.commonSave,
              onPressed: _busy || _failed ? null : _save,
              icon: const Icon(Icons.save_outlined),
            ),
        ],
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
              padding: EdgeInsets.fromLTRB(
                16,
                16,
                16,
                16 + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                SwitchListTile(
                  title: Text(l10n.mailLoadImages),
                  subtitle: Text(l10n.mailLoadImagesDescription),
                  value: MailImagePreference.instance.value,
                  onChanged: (enabled) => unawaited(
                    MailImagePreference.instance.select(enabled: enabled),
                  ),
                ),
                if (widget.swipePreferences != null)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.swipe_outlined),
                    title: Text(l10n.mailSwipeActions),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showMailSwipeSettings(
                      context,
                      widget.swipePreferences!,
                    ),
                  ),
                if (widget.canManage) ...[
                  TextField(
                    controller: _sender,
                    maxLength: 160,
                    decoration: InputDecoration(labelText: l10n.mailSenderName),
                  ),
                  TextField(
                    controller: _signature,
                    minLines: 3,
                    maxLines: 8,
                    decoration: InputDecoration(labelText: l10n.mailSignature),
                  ),
                  TextField(
                    controller: _instructions,
                    minLines: 3,
                    maxLines: 8,
                    decoration: InputDecoration(
                      labelText: l10n.mailAiInstructions,
                    ),
                  ),
                  SwitchListTile(
                    title: Text(l10n.mailAutoDraft),
                    value: _autoDraft,
                    onChanged: (v) => setState(() => _autoDraft = v),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: _provider ?? 'default',
                    decoration: InputDecoration(
                      labelText: l10n.mailDeliveryProvider,
                    ),
                    items: ['default', 'cloudflare', 'ses']
                        .map(
                          (v) => DropdownMenuItem(
                            value: v,
                            child: Text(
                              v == 'default'
                                  ? l10n.mailDomainDefault
                                  : v == 'ses'
                                  ? 'Amazon SES'
                                  : 'Cloudflare',
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) =>
                        setState(() => _provider = v == 'default' ? null : v),
                  ),
                  if (_group == null) ...[
                    SwitchListTile(
                      title: Text(l10n.mailSmartLabels),
                      value: _smartLabels,
                      onChanged: (v) => setState(() => _smartLabels = v),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: _forwarding,
                      decoration: InputDecoration(
                        labelText: l10n.mailForwarding,
                      ),
                      items:
                          {
                                'off': l10n.mailForwardingOff,
                                'catch_all': l10n.mailCatchAll,
                                'mailbox': l10n.mailMailbox,
                              }.entries
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e.key,
                                  child: Text(e.value),
                                ),
                              )
                              .toList(),
                      onChanged: (v) => setState(() => _forwarding = v!),
                    ),
                    if (_forwarding == 'mailbox')
                      TextField(
                        controller: _forwardTo,
                        keyboardType: TextInputType.emailAddress,
                        decoration: InputDecoration(
                          labelText: l10n.mailForwardTo,
                        ),
                      ),
                  ],
                  if (_group != null) ...[
                    for (final field in {
                      'posting': l10n.mailGroupPosting,
                      'attachments': l10n.mailGroupAttachments,
                      'sendAs': l10n.mailGroupSendAs,
                    }.entries)
                      DropdownButtonFormField<String>(
                        initialValue: _group![field.key] as String,
                        decoration: InputDecoration(labelText: field.value),
                        items:
                            {
                                  'anyone': l10n.mailAnyone,
                                  'organization': l10n.mailOrganization,
                                  'members': l10n.mailMembers,
                                  'managers': l10n.mailManagers,
                                }.entries
                                .where(
                                  (e) =>
                                      field.key != 'sendAs' ||
                                      ['members', 'managers'].contains(e.key),
                                )
                                .map(
                                  (e) => DropdownMenuItem(
                                    value: e.key,
                                    child: Text(e.value),
                                  ),
                                )
                                .toList(),
                        onChanged: (v) =>
                            setState(() => _group![field.key] = v),
                      ),
                  ],
                  const Divider(),
                  for (final section in {
                    'labels': l10n.mailLabels,
                    'folders': l10n.mailFolders,
                    'members': l10n.mailMembers,
                  }.entries)
                    ListTile(
                      title: Text(section.value),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push<void>(
                        MaterialPageRoute(
                          builder: (_) => MailOrganizationPage(
                            repository: widget.repository,
                            workspaceId: widget.workspaceId,
                            mailboxId: widget.mailboxId,
                            kind: section.key,
                          ),
                        ),
                      ),
                    ),
                ],
              ],
            ),
    );
  }
}
