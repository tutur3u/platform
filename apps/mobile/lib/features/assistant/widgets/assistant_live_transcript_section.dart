import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveTranscriptSection extends StatelessWidget {
  const AssistantLiveTranscriptSection({
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
    final history =
        chatState.workspaceId == liveState.workspaceId &&
            (chatState.chat?.id ?? chatState.fallbackChatId) == liveState.chatId
        ? chatState.messages
        : const <AssistantMessage>[];
    final messages = [...history];
    final savedSides = {
      for (final message in history)
        if (message.liveTurnId != null) (message.liveTurnId, message.role),
    };
    for (final turn in liveState.completedTurns) {
      final userText = turn.userText.isNotEmpty
          ? turn.userText
          : turn.userTranscript;
      if (userText.isNotEmpty && !savedSides.contains((turn.id, 'user'))) {
        messages.add(
          AssistantMessage(
            id: '${turn.id}:user',
            liveTurnId: turn.id,
            role: 'user',
            parts: [AssistantMessagePart(type: 'text', text: userText)],
            createdAt: turn.createdAt,
          ),
        );
      }
      if (!savedSides.contains((turn.id, 'assistant')) &&
          (turn.assistantText.isNotEmpty ||
              turn.assistantTranscript.isNotEmpty ||
              turn.parts.parts.isNotEmpty)) {
        messages.add(
          AssistantMessage(
            id: '${turn.id}:assistant',
            liveTurnId: turn.id,
            role: 'assistant',
            parts: turn.parts.parts,
            createdAt: turn.createdAt,
          ),
        );
      }
    }
    // Server retry timestamps can be later than subsequent turns. The captured
    // turn identity preserves conversational order across retry/history refresh.
    final positions = {
      for (var i = 0; i < messages.length; i++) messages[i].id: i,
    };
    messages.sort((left, right) {
      final comparison = _turnTime(left).compareTo(_turnTime(right));
      if (comparison != 0) return comparison;
      if (left.liveTurnId != null &&
          left.liveTurnId == right.liveTurnId &&
          left.role != right.role) {
        return left.role == 'user' ? -1 : 1;
      }
      return positions[left.id]!.compareTo(positions[right.id]!);
    });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (liveState.completedTurns.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Semantics(
              liveRegion: true,
              child: Text(context.l10n.assistantLiveTranscriptPending),
            ),
          ),
        for (final message in messages)
          Padding(
            key: ValueKey((
              'live-turn',
              liveState.workspaceId,
              liveState.chatId,
              message.liveTurnId ?? message.id,
              message.role,
            )),
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: message.role == 'user'
                  ? context.l10n.assistantYouLabel
                  : assistantName,
              alignEnd: message.role == 'user',
              text: message.parts
                  .where((part) => part.type == 'text')
                  .map((part) => part.text ?? '')
                  .join('\n\n'),
              transcript: '',
              orderedParts: message.role == 'user' ? const [] : message.parts,
              attachments:
                  chatState.attachmentsByMessageId[message.id] ?? const [],
              timestamp: message.role == 'user' ? message.createdAt : null,
              toolNames: const [],
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
            liveState.assistantTranscript.isNotEmpty ||
            liveState.assistantParts.isNotEmpty)
          AssistantTranscriptBubble(
            label: context.l10n.assistantLiveDraftAssistant,
            alignEnd: false,
            text: liveState.assistantDraft,
            transcript: liveState.assistantTranscript,
            orderedParts: liveState.assistantParts,
            attachments: const [],
            timestamp: null,
            toolNames: const [],
            isDraft: true,
          ),
      ],
    );
  }
}

int _turnTime(AssistantMessage message) =>
    int.tryParse(message.liveTurnId?.replaceFirst('live-', '') ?? '') ??
    message.createdAt?.microsecondsSinceEpoch ??
    0;
