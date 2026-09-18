import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_body_editor.dart';
import 'package:mobile/l10n/l10n.dart';

class MailComposer extends StatefulWidget {
  const MailComposer({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.fromAddress,
    super.key,
    this.draft,
    this.reply,
    this.replyAll = false,
    this.forward = false,
    this.signatureText,
    this.signatureHtml,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String fromAddress;
  final Map<String, dynamic>? draft;
  final Map<String, dynamic>? reply;
  final bool replyAll;
  final bool forward;
  final String? signatureText;
  final String? signatureHtml;

  @override
  State<MailComposer> createState() => _MailComposerState();
}

class _MailComposerState extends State<MailComposer> {
  final _to = TextEditingController();
  final _cc = TextEditingController();
  final _bcc = TextEditingController();
  final _subject = TextEditingController();
  final _body = MailBodyController();
  String? _draftId;
  List<Map<String, dynamic>> _attachments = [];
  bool _busy = false;
  bool _dirty = false;
  bool _canPop = false;
  bool _forwardCopied = false;

  @override
  void initState() {
    super.initState();
    final draft = widget.draft;
    if (draft != null) {
      _draftId = draft['id'] as String;
      final recipients = mailRows(draft['recipients']);
      String addresses(String kind) => recipients
          .where((r) => r['kind'] == kind)
          .map((r) => r['address'] as String)
          .join(', ');
      _to.text = addresses('to');
      _cc.text = addresses('cc');
      _bcc.text = addresses('bcc');
      _subject.text = draft['subject'] as String? ?? '';
      _body.load(
        draft['bodyText'] as String? ?? '',
        html: draft['bodyHtml'] as String?,
      );
      _attachments = mailRows(draft['attachments']);
    }
    final reply = widget.reply;
    if (reply != null) {
      final recipients = mailRows(reply['recipients']);
      final replyTo = recipients
          .where((r) => r['kind'] == 'reply_to')
          .map((r) => r['address'] as String)
          .toList();
      final sender = reply['fromAddress'] as String;
      final addresses =
          <String>{
            ...replyTo.isEmpty ? [sender] : replyTo,
            if (widget.replyAll)
              ...recipients
                  .where((r) => r['kind'] == 'to')
                  .map((r) => r['address'] as String),
          }..removeWhere(
            (a) => a.toLowerCase() == widget.fromAddress.toLowerCase(),
          );
      _to.text = widget.forward ? '' : addresses.join(', ');
      if (widget.replyAll) {
        _cc.text = recipients
            .where((r) => r['kind'] == 'cc')
            .map((r) => r['address'] as String)
            .where(
              (a) =>
                  a.toLowerCase() != widget.fromAddress.toLowerCase() &&
                  !addresses.contains(a),
            )
            .toSet()
            .join(', ');
      }
      final subject = reply['subject'] as String? ?? '';
      _subject.text =
          RegExp(
            widget.forward ? '^fwd?:' : '^re:',
            caseSensitive: false,
          ).hasMatch(subject)
          ? subject
          : '${widget.forward ? 'Fwd' : 'Re'}: $subject';
      _body.text = '\n\n$sender:\n${reply['bodyText'] ?? ''}';
    }
    if (draft == null) {
      const escape = HtmlEscape();
      final signatureHtml =
          widget.signatureHtml ??
          escape.convert(widget.signatureText ?? '').replaceAll('\n', '<br>');
      final quoteText = reply == null ? '' : _body.text;
      final quoteHtml = reply == null
          ? ''
          : '<blockquote type="cite"><p>${escape.convert(reply['fromAddress'] as String)}</p>${reply['sanitizedHtml'] ?? escape.convert(reply['bodyText'] as String? ?? '').replaceAll('\n', '<br>')}</blockquote>';
      _body.load(
        '\n\n${widget.signatureText ?? ''}$quoteText',
        html:
            '<p><br></p>${signatureHtml.isEmpty ? '' : '<div data-mail-signature="true">$signatureHtml</div>'}$quoteHtml',
      );
    }
    for (final controller in [_to, _cc, _bcc, _subject, _body]) {
      controller.addListener(() => _dirty = true);
    }
  }

  @override
  void dispose() {
    for (final controller in [_to, _cc, _bcc, _subject, _body]) {
      controller.dispose();
    }
    super.dispose();
  }

  List<String> _addresses(String value) => value
      .split(RegExp('[,;\n]'))
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .toList();

  Map<String, dynamic> get _payload => {
    'to': _addresses(_to.text),
    'cc': _addresses(_cc.text),
    'bcc': _addresses(_bcc.text),
    'subject': _subject.text,
    'bodyText': _body.text,
    'bodyHtml': _body.html,
    if (widget.draft != null) ...{
      'recipientDisplayNames': {
        for (final recipient in mailRows(widget.draft!['recipients']))
          if (recipient['displayName'] != null)
            recipient['address'] as String: recipient['displayName'],
      },
      'inReplyTo': widget.draft!['inReplyTo'],
      'references': widget.draft!['references'] ?? <String>[],
    },
    if (widget.reply != null && !widget.forward) ...{
      'inReplyTo': widget.reply!['internetMessageId'],
      'references': [
        ...widget.reply!['references'] as List<dynamic>? ?? [],
        if (widget.reply!['internetMessageId'] != null)
          widget.reply!['internetMessageId'],
      ],
    },
  };

  Future<void> _save() async {
    if (!mounted) throw StateError('Mail session changed');
    final result = await widget.repository.saveDraft(
      widget.workspaceId,
      widget.mailboxId,
      _payload,
      draftId: _draftId,
    );
    if (!mounted) throw StateError('Mail session changed');
    _draftId = (result['message'] as Map<String, dynamic>)['id'] as String;
    if (widget.forward && !_forwardCopied && widget.reply != null) {
      final ids = mailRows(
        widget.reply!['attachments'],
      ).map((a) => a['id'] as String).toList();
      if (ids.isNotEmpty) {
        final copied = await widget.repository.copyAttachments(
          widget.workspaceId,
          widget.mailboxId,
          _draftId!,
          widget.reply!['id'] as String,
          ids,
        );
        if (!mounted) throw StateError('Mail session changed');
        _attachments = mailRows(copied['attachments']);
      }
      _forwardCopied = true;
    }
    _dirty = false;
  }

  Future<void> _perform(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _close() async {
    if (_busy) return;
    if (_dirty) {
      await _perform(_save);
      if (_dirty) return;
    }
    if (!mounted) return;
    setState(() => _canPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  Future<void> _attach() async {
    final file = await FilePicker.pickFile();
    if (file == null || !mounted) return;
    await _perform(() async {
      if (await file.length() > 25 * 1024 * 1024) {
        throw StateError('Attachment too large');
      }
      final bytes = await file.readAsBytes();
      await _save();
      final result = await widget.repository.uploadAttachment(
        widget.workspaceId,
        widget.mailboxId,
        _draftId!,
        bytes,
        file.name,
      );
      if (mounted) {
        setState(
          () => _attachments.add(result['attachment'] as Map<String, dynamic>),
        );
      }
    });
  }

  Future<void> _send() async {
    final recipients = [
      ..._addresses(_to.text),
      ..._addresses(_cc.text),
      ..._addresses(_bcc.text),
    ];
    if (recipients.isEmpty ||
        recipients.any(
          (a) => !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(a),
        )) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.mailInvalidRecipient)),
      );
      return;
    }
    await _perform(() async {
      await _save();
      await widget.repository.send(widget.workspaceId, widget.mailboxId, {
        ..._payload,
        'draftId': _draftId,
      });
      if (!mounted) return;
      _dirty = false;
      setState(() => _canPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
    });
  }

  Future<void> _generate() async {
    final selection = _body.quill.selection;
    final originalText = _body.text;
    final selected =
        selection.isValid &&
        !selection.isCollapsed &&
        selection.end <= originalText.length;
    final prompt = TextEditingController();
    final instructions = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.mailAiDraft),
        content: TextField(
          controller: prompt,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            labelText: context.l10n.mailAiInstructions,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(prompt.text.trim()),
            child: Text(context.l10n.mailGenerate),
          ),
        ],
      ),
    );
    prompt.dispose();
    if (instructions == null || instructions.isEmpty || !mounted) return;
    await _perform(() async {
      final result = await widget.repository
          .aiDraft(widget.workspaceId, widget.mailboxId, {
            'mode': selected || _body.text.trim().isNotEmpty
                ? 'rewrite'
                : 'draft',
            'instructions': selected
                ? 'Rewrite only the selected passage. Return only its '
                      'replacement, without greeting, subject, signature, '
                      'or quoted history. $instructions'
                : instructions,
            'bodyText': selected
                ? originalText.substring(selection.start, selection.end)
                : _body.text,
            'subject': _subject.text,
            'recipients': _addresses(_to.text),
            if (widget.reply?['threadId'] != null)
              'threadId': widget.reply!['threadId'],
          });
      if (!mounted) return;
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(context.l10n.mailAiDraft),
          content: SingleChildScrollView(
            child: SelectableText(
              '${result['subject']}\n\n${result['content']}',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(context.l10n.commonCancel),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(context.l10n.commonApply),
            ),
          ],
        ),
      );
      if (accepted != true || !mounted) return;
      if (selected) {
        if (_body.text != originalText) return;
        final content = result['content'] as String;
        _body.quill.replaceText(
          selection.start,
          selection.end - selection.start,
          content,
          TextSelection.collapsed(offset: selection.start + content.length),
        );
        return;
      }
      _subject.text = result['subject'] as String;
      _body.text = result['content'] as String;
    });
  }

  Future<void> _deleteDraft() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.mailDeleteDraft),
        content: Text(context.l10n.mailDeleteDraftConfirmation),
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
    await _perform(() async {
      await widget.repository.deleteDraft(
        widget.workspaceId,
        widget.mailboxId,
        _draftId!,
      );
      if (!mounted) return;
      _dirty = false;
      await _closeAfterDelete();
    });
  }

  Future<void> _closeAfterDelete() async {
    setState(() => _canPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: _canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_close());
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.mailCompose),
          actions: [
            if (_draftId != null)
              IconButton(
                tooltip: l10n.mailDeleteDraft,
                onPressed: _busy ? null : _deleteDraft,
                icon: const Icon(Icons.delete_outline),
              ),
            IconButton(
              tooltip: l10n.mailAiDraft,
              onPressed: _busy ? null : _generate,
              icon: const Icon(Icons.auto_awesome_outlined),
            ),
            IconButton(
              tooltip: l10n.mailSaveDraft,
              onPressed: _busy ? null : () => _perform(_save),
              icon: const Icon(Icons.save_outlined),
            ),
            IconButton(
              tooltip: l10n.mailSend,
              onPressed: _busy ? null : _send,
              icon: const Icon(Icons.send_outlined),
            ),
          ],
        ),
        body: AbsorbPointer(
          absorbing: _busy,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_busy) const LinearProgressIndicator(),
              Text(widget.fromAddress),
              for (final field in [
                (_to, l10n.mailTo),
                (_cc, l10n.mailCc),
                (_bcc, l10n.mailBcc),
              ])
                TextField(
                  controller: field.$1,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(labelText: field.$2),
                ),
              TextField(
                controller: _subject,
                decoration: InputDecoration(labelText: l10n.mailSubject),
              ),
              MailBodyEditor(controller: _body),
              TextButton.icon(
                onPressed: _attach,
                icon: const Icon(Icons.attach_file),
                label: Text(l10n.mailAttach),
              ),
              for (final attachment in _attachments)
                ListTile(
                  title: Text(attachment['filename'] as String),
                  trailing: IconButton(
                    tooltip: l10n.mailRemoveAttachment,
                    icon: const Icon(Icons.close),
                    onPressed: () => _perform(() async {
                      await widget.repository.removeAttachment(
                        widget.workspaceId,
                        widget.mailboxId,
                        _draftId!,
                        attachment['id'] as String,
                      );
                      if (mounted) {
                        setState(() => _attachments.remove(attachment));
                      }
                    }),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
