import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

class MailInvitationCard extends StatefulWidget {
  const MailInvitationCard({
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
  State<MailInvitationCard> createState() => _MailInvitationCardState();
}

class _MailInvitationCardState extends State<MailInvitationCard> {
  Map<String, dynamic>? _invitation;
  Map<String, dynamic>? _reply;
  bool _failed = false;
  bool _busy = false;
  int _generation = 0;
  String? _attemptResponse;
  String? _requestId;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant MailInvitationCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.mailboxId != widget.mailboxId ||
        oldWidget.messageId != widget.messageId ||
        oldWidget.repository != widget.repository) {
      _invitation = null;
      _reply = null;
      _busy = false;
      _requestId = null;
      _attemptResponse = null;
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    try {
      final result = await widget.repository.invitation(
        widget.workspaceId,
        widget.mailboxId,
        widget.messageId,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _invitation = result;
        _reply = result?['reply'] as Map<String, dynamic>?;
        _failed = false;
        if (_reply?['retryRequestId'] is String) {
          _requestId = _reply!['retryRequestId'] as String;
          _attemptResponse = _reply!['response'] as String;
        }
      });
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    }
  }

  Future<void> _respond(String response) async {
    if (_busy) return;
    if (_attemptResponse != response || _reply?['status'] == 'sent') {
      _attemptResponse = response;
      _requestId = newLocalMutationId();
    }
    final generation = _generation;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final result = await widget.repository.respondToInvitation(
        widget.workspaceId,
        widget.mailboxId,
        widget.messageId,
        response: response,
        requestId: _requestId!,
      );
      if (!mounted || generation != _generation) return;
      setState(() => _reply = {...result, 'response': response});
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final invitation = _invitation;
    if (invitation == null) {
      return _failed
          ? TextButton(onPressed: _load, child: Text(l10n.mailInvitationRetry))
          : const SizedBox.shrink();
    }
    final labels = {
      'ACCEPTED': l10n.mailInvitationAccept,
      'DECLINED': l10n.mailInvitationDecline,
      'TENTATIVE': l10n.mailInvitationTentative,
    };
    final joinUrl = invitation['joinUrl'] as String?;
    final status = _reply?['status'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              invitation['summary'] as String? ?? l10n.mailInvitationTitle,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            SelectableText(
              l10n.mailInvitationIdentity(
                invitation['attendee'] as String,
                invitation['organizer'] as String,
              ),
            ),
            Text('${l10n.mailInvitationWhen}: ${invitation['when']}'),
            if ((invitation['location'] as String? ?? '').isNotEmpty)
              SelectableText(
                '${l10n.mailInvitationLocation}: ${invitation['location']}',
              ),
            if (joinUrl != null)
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(joinUrl),
                  mode: LaunchMode.externalApplication,
                ),
                child: Text(l10n.mailInvitationJoin),
              ),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in labels.entries)
                  OutlinedButton(
                    onPressed:
                        _busy ||
                            status == 'sending' ||
                            (status == 'sent' &&
                                _reply?['response'] == entry.key)
                        ? null
                        : () => _respond(entry.key),
                    child: Text(entry.value),
                  ),
              ],
            ),
            Semantics(
              liveRegion: true,
              child: Text(
                _busy
                    ? l10n.mailInvitationSending
                    : _failed || status == 'failed'
                    ? l10n.mailInvitationFailed
                    : status == 'sending'
                    ? l10n.mailInvitationPending
                    : status == 'sent'
                    ? l10n.mailInvitationSent(labels[_reply?['response']] ?? '')
                    : '',
              ),
            ),
            if (!_busy &&
                (_failed || status == 'sending' || status == 'failed'))
              TextButton(
                onPressed: _load,
                child: Text(l10n.mailInvitationRetry),
              ),
          ],
        ),
      ),
    );
  }
}
