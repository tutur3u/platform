import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_settings_chrome.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Resolve real mailbox membership before opening the shared Mail editor.
class MailSettingsHub extends StatefulWidget {
  const MailSettingsHub({
    required this.workspaceId,
    required this.locations,
    required this.isScopeCurrent,
    this.repository,
    super.key,
  });
  final String workspaceId;
  final Set<String> locations;
  final bool Function() isScopeCurrent;
  final MailRepository? repository;
  @override
  State<MailSettingsHub> createState() => _MailSettingsHubState();
}

class _MailSettingsHubState extends State<MailSettingsHub> {
  late final MailRepository _repository = widget.repository ?? MailRepository();
  List<Map<String, dynamic>> _mailboxes = [];
  bool _busy = true;
  bool _failed = false;
  bool _childOpen = false;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!widget.isScopeCurrent()) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final result = await _repository.settingsBootstrap(widget.workspaceId);
      if (!mounted || !widget.isScopeCurrent()) return;
      setState(() => _mailboxes = mailRows(result['mailboxes']));
    } on Object {
      if (mounted && widget.isScopeCurrent()) setState(() => _failed = true);
    } finally {
      if (mounted && widget.isScopeCurrent()) setState(() => _busy = false);
    }
  }

  Future<void> _open(Map<String, dynamic> box) async {
    if (!widget.isScopeCurrent()) return;
    setState(() => _childOpen = true);
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted || !widget.isScopeCurrent()) return;
    try {
      await pushScopedSettingsPage(
        context,
        builder: (_, isCurrent) => MailSettingsPage(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: box['id'] as String,
          canManage: ['owner', 'admin'].contains(box['role']),
          shellLocations: widget.locations,
          isScopeCurrent: () => widget.isScopeCurrent() && isCurrent(),
        ),
      );
    } finally {
      if (mounted) setState(() => _childOpen = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = ColoredBox(
      color: mailSettingsBackground(context),
      child: _busy
          ? const Center(child: NovaLoadingIndicator(size: 20))
          : _failed
          ? Center(
              child: TextButton(
                onPressed: _load,
                child: Text(context.l10n.commonRetry),
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
                if (_mailboxes.isEmpty) Text(context.l10n.mailEmpty),
                for (final box in _mailboxes)
                  SettingsTile(
                    icon: Icons.alternate_email,
                    title:
                        box['address'] as String? ?? context.l10n.mailMailbox,
                    onTap: () => unawaited(_open(box)),
                  ),
              ],
            ),
    );
    if (_childOpen) return content;
    return MailSettingsChrome(
      locations: widget.locations,
      canManage: false,
      child: content,
    );
  }
}
