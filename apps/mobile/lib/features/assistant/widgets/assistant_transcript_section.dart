import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantTranscriptSection extends StatelessWidget {
  const AssistantTranscriptSection({
    required this.chatState,
    required this.liveState,
    required this.assistantName,
    super.key,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final String assistantName;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...chatState.messages.map(
          (message) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: message.role == 'user'
                  ? context.l10n.assistantYouLabel
                  : assistantName,
              alignEnd: message.role == 'user',
              text: _messageText(message),
              transcript: _messageTranscript(message),
              attachments:
                  chatState.attachmentsByMessageId[message.id] ?? const [],
              timestamp: message.createdAt,
              toolNames: message.parts
                  .where((part) => part.type == 'dynamic-tool')
                  .map(
                    (part) => part.toolName ?? context.l10n.assistantToolLabel,
                  )
                  .toList(growable: false),
            ),
          ),
        ),
        if (liveState.userDraft.isNotEmpty ||
            liveState.userTranscript.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: context.l10n.assistantLiveDraftUser,
              alignEnd: true,
              text: liveState.userDraft,
              transcript: liveState.userTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: const [],
              isDraft: true,
            ),
          ),
        if (liveState.assistantDraft.isNotEmpty ||
            liveState.assistantTranscript.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: context.l10n.assistantLiveDraftAssistant,
              alignEnd: false,
              text: liveState.assistantDraft,
              transcript: liveState.assistantTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: liveState.insightCards
                  .map((card) => card.title)
                  .toList(growable: false),
              isDraft: true,
            ),
          ),
      ],
    );
  }
}

String _messageText(AssistantMessage message) {
  return message.parts
      .where((part) => part.type == 'text')
      .map((part) => part.text ?? '')
      .join('\n\n')
      .trim();
}

String _messageTranscript(AssistantMessage message) {
  for (final part in message.parts) {
    if (part.type == 'reasoning' && (part.text?.trim().isNotEmpty ?? false)) {
      return part.text!.trim();
    }
  }
  return '';
}
