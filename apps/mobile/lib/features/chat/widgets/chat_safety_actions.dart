import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_block_sheet.dart';
import 'package:mobile/features/chat/widgets/chat_message_actions.dart';
import 'package:mobile/features/chat/widgets/chat_report_sheet.dart';

export 'package:mobile/features/chat/widgets/chat_block_sheet.dart';
export 'package:mobile/features/chat/widgets/chat_message_actions.dart'
    show ChatSafetyAction;
export 'package:mobile/features/chat/widgets/chat_report_sheet.dart';

/// Opens the sheet for a safety [action] on another person's [message].
void openChatSafetyAction(
  BuildContext context, {
  required ChatCubit cubit,
  required ChatMessage message,
  required ChatSafetyAction action,
}) {
  final sender = chatMessageSenderProfile(context, message);
  if (sender.id.isEmpty) return;
  unawaited(switch (action) {
    ChatSafetyAction.reportMessage => showChatReportSheet(
      context,
      cubit: cubit,
      subject: sender,
      message: message,
    ),
    ChatSafetyAction.reportSender => showChatReportSheet(
      context,
      cubit: cubit,
      subject: sender,
    ),
    ChatSafetyAction.blockSender => showChatBlockSheet(
      context,
      cubit: cubit,
      user: sender,
    ),
  });
}
