import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetPersonalChatPanel extends StatefulWidget {
  const MeetPersonalChatPanel({required this.call, super.key});

  final MeetCallController call;

  @override
  State<MeetPersonalChatPanel> createState() => _MeetPersonalChatPanelState();
}

class _MeetPersonalChatPanelState extends State<MeetPersonalChatPanel> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final question = _input.text.trim();
    if (question.isEmpty) return;
    final sent = await widget.call.personalChat.ask(question);
    if (sent && mounted) _input.clear();
  }

  Future<void> _share(String answer) async {
    try {
      final approved = await showDialog<String>(
        context: context,
        builder: (_) => _ShareDraftDialog(
          initial: answer.length > 2000 ? answer.substring(0, 2000) : answer,
        ),
      );
      if (approved == null || approved.isEmpty) return;
      await widget.call.sendMessage(approved);
    } on Object {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
      );
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.call.personalChat,
    builder: (context, _) {
      final chat = widget.call.personalChat;
      final l10n = context.l10n;
      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                const Icon(Icons.lock_outline, size: 20),
                const SizedBox(width: 8),
                Expanded(child: Text(l10n.meetPrivateHint)),
              ],
            ),
          ),
          Expanded(
            child: chat.turns.isEmpty
                ? Center(child: Text(l10n.meetPrivateEmpty))
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: chat.turns.length,
                    itemBuilder: (context, index) {
                      final turn = chat.turns[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              turn.assistant ? l10n.meetMiraCost : l10n.meetYou,
                              style: Theme.of(context).textTheme.labelMedium,
                            ),
                            const SizedBox(height: 4),
                            AssistantMarkdownBody(data: turn.body),
                            if (turn.assistant)
                              TextButton.icon(
                                onPressed: () => unawaited(_share(turn.body)),
                                icon: const Icon(Icons.share_outlined),
                                label: Text(l10n.meetShareWithEveryone),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          if (chat.error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                l10n.meetPrivateRequestFailed,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (chat.pending) const LinearProgressIndicator(),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    enabled: !chat.pending,
                    maxLength: 2000,
                    maxLines: 3,
                    minLines: 1,
                    decoration: InputDecoration(
                      hintText: l10n.meetAskMira,
                      counterText: '',
                    ),
                    onSubmitted: (_) => unawaited(_ask()),
                  ),
                ),
                IconButton(
                  tooltip: l10n.meetSend,
                  onPressed: chat.pending ? null : () => unawaited(_ask()),
                  icon: const Icon(Icons.send_outlined),
                ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

class _ShareDraftDialog extends StatefulWidget {
  const _ShareDraftDialog({required this.initial});

  final String initial;

  @override
  State<_ShareDraftDialog> createState() => _ShareDraftDialogState();
}

class _ShareDraftDialogState extends State<_ShareDraftDialog> {
  late final _draft = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.l10n.meetShareWithEveryone),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(context.l10n.meetShareHint),
        const SizedBox(height: 12),
        TextField(
          controller: _draft,
          maxLength: 2000,
          maxLines: 5,
          minLines: 3,
        ),
      ],
    ),
    actions: [
      TextButton.icon(
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.close),
        label: Text(context.l10n.commonCancel),
      ),
      FilledButton.icon(
        onPressed: () => Navigator.pop(context, _draft.text.trim()),
        icon: const Icon(Icons.share_outlined),
        label: Text(context.l10n.meetShareConfirm),
      ),
    ],
  );
}
