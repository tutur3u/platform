import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantHistorySheetBody extends StatelessWidget {
  const AssistantHistorySheetBody({
    required this.chatCubit,
    required this.activeChatId,
    required this.onClose,
    required this.onNewConversation,
    required this.onSelectChat,
    super.key,
  });

  final AssistantChatCubit chatCubit;
  final String? activeChatId;
  final Future<void> Function() onClose;
  final Future<void> Function() onNewConversation;
  final Future<void> Function(AssistantChatRecord chat) onSelectChat;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
        child: BlocBuilder<AssistantChatCubit, AssistantChatState>(
          bloc: chatCubit,
          builder: (context, state) {
            return SizedBox(
              height: context.isCompact ? 420 : 480,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.assistantHistoryTitle,
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      IconButton(
                        onPressed: onClose,
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onNewConversation,
                      icon: const Icon(Icons.add_comment_rounded, size: 18),
                      label: Text(context.l10n.assistantNewConversation),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (state.history.isEmpty)
                    Text(
                      context.l10n.assistantHistoryEmpty,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        itemCount: state.history.length,
                        separatorBuilder: (_, _) => const Divider(height: 18),
                        itemBuilder: (context, index) {
                          final chat = state.history[index];
                          final formatter = DateFormat.MMMd().add_jm();
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(child: Text('${index + 1}')),
                            title: Text(
                              chat.title?.trim().isNotEmpty == true
                                  ? chat.title!
                                  : context.l10n.assistantUntitledChat,
                            ),
                            subtitle: Text(
                              chat.createdAt == null
                                  ? (chat.model ?? '')
                                  : formatter.format(chat.createdAt!.toLocal()),
                            ),
                            trailing: chat.id == activeChatId
                                ? const Icon(Icons.check_circle_rounded)
                                : null,
                            onTap: () => onSelectChat(chat),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
