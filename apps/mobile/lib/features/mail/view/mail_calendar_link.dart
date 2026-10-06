import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/models/mail_calendar_link_preview.dart';
import 'package:mobile/features/mail/view/mail_calendar_link_details.dart';
import 'package:mobile/l10n/l10n.dart';

class MailCalendarLink extends StatefulWidget {
  const MailCalendarLink({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.messageId,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String messageId;
  @override
  State<MailCalendarLink> createState() => _MailCalendarLinkState();
}

class _MailCalendarLinkState extends State<MailCalendarLink> {
  final _url = TextEditingController();
  Map<String, dynamic>? _linked;
  MailCalendarLinkPreview? _preview;
  bool _busy = false;
  String _notice = '';
  int _generation = 0;
  int _loadEpoch = 0;
  String get _scope =>
      '${widget.workspaceId}/${widget.mailboxId}/${widget.messageId}';
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant MailCalendarLink oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ('${oldWidget.workspaceId}/${oldWidget.mailboxId}/${oldWidget.messageId}' !=
            _scope ||
        oldWidget.repository != widget.repository) {
      _generation++;
      _url.clear();
      _linked = null;
      _preview = null;
      _notice = '';
      _busy = false;
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _generation++;
    _url.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = _generation;
    final epoch = ++_loadEpoch;
    try {
      final linked = await widget.repository.calendarLink(
        widget.workspaceId,
        widget.mailboxId,
        widget.messageId,
      );
      if (mounted && generation == _generation && epoch == _loadEpoch) {
        setState(() {
          _linked = linked;
          if (_notice == 'failed') _notice = '';
        });
      }
    } on Object {
      if (mounted && generation == _generation && epoch == _loadEpoch) {
        setState(() => _notice = 'failed');
      }
    }
  }

  Future<void> _act(String action) async {
    if (_busy) return;
    if (action != 'preview') _loadEpoch++;
    final generation = _generation;
    setState(() => _busy = true);
    unawaited(AppHaptics.selection());
    try {
      Map<String, dynamic> result;
      if (action == 'unlink') {
        final association = _linked?['association'] as Map?;
        if (association == null) return;
        result = await widget.repository.unlinkCalendarLink(
          widget.workspaceId,
          widget.mailboxId,
          widget.messageId,
          association['receipt'] as String,
        );
      } else if (action == 'preview') {
        final selection = parseMailCalendarEventUrl(_url.text);
        if (selection == null) {
          if (mounted && generation == _generation) {
            setState(() => _notice = 'invalid');
          }
          return;
        }
        result = await widget.repository.previewCalendarLink(
          widget.workspaceId,
          widget.mailboxId,
          widget.messageId,
          selection,
        );
      } else {
        final preview = _preview;
        if (preview == null) return;
        result = await widget.repository.confirmCalendarLink(
          widget.workspaceId,
          widget.mailboxId,
          widget.messageId,
          preview.selection,
        );
      }
      if (!mounted || generation != _generation) return;
      if (action == 'preview') {
        final raw = result['preview'] as Map<String, dynamic>?;
        setState(() {
          _preview = raw == null ? null : MailCalendarLinkPreview.fromJson(raw);
          _notice = raw == null ? 'unavailable' : '';
        });
      } else {
        final status = result['status'];
        setState(() {
          _notice = status == 'linked'
              ? 'linked'
              : status == 'unlinked'
              ? ''
              : status == 'unavailable'
              ? 'unavailable'
              : 'changed';
          _preview = null;
        });
        if (status == 'linked' || status == 'unlinked') {
          unawaited(AppHaptics.success());
          await _load();
        } else {
          unawaited(AppHaptics.warning());
        }
      }
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _notice = 'failed');
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final preview = _preview;
    final target = _linked?['target'] as Map?;
    final notices = {
      'linked': l.mailCalendarLinkLinked,
      'changed': l.mailCalendarLinkChanged,
      'unavailable': l.mailCalendarLinkUnavailable,
      'failed': l.mailCalendarLinkFailed,
      'invalid': l.mailCalendarLinkInvalid,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        Text(l.mailCalendarLinkTitle),
        Text(l.mailCalendarLinkNotice),
        if (target != null)
          Text('${target['title']} · ${target['accountLabel']}'),
        if (target?['calendarUrl'] is String)
          TextButton(
            onPressed: () => openMobileLink(
              context,
              Uri.parse(target!['calendarUrl'] as String),
            ),
            child: Text(l.mailCalendarLinkOpen),
          ),
        if (_linked?['association'] != null)
          TextButton(
            onPressed: _busy ? null : () => _act('unlink'),
            child: Text(l.mailCalendarLinkUnlink),
          ),
        TextField(
          controller: _url,
          enabled: !_busy,
          decoration: InputDecoration(labelText: l.mailCalendarLinkUrl),
          onChanged: (_) => setState(() {
            _preview = null;
            _notice = '';
          }),
        ),
        OutlinedButton(
          onPressed: _busy ? null : () => _act('preview'),
          child: Text(l.mailCalendarLinkPreview),
        ),
        if (preview != null)
          MailCalendarLinkDetails(
            preview: preview,
            busy: _busy,
            onConfirm: () => _act('confirm'),
            onCancel: () => setState(() => _preview = null),
          ),
        if (_notice == 'failed')
          TextButton(
            onPressed: _busy ? null : _load,
            child: Text(l.mailInvitationRetry),
          ),
        if (_notice.isNotEmpty)
          Semantics(liveRegion: true, child: Text(notices[_notice] ?? '')),
      ],
    );
  }
}
