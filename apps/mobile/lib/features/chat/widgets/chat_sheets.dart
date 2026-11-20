import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'chat_create_conversation_sheet.dart';
part 'chat_directory_sheet.dart';
part 'chat_search_sheet.dart';
part 'chat_sheet_common.dart';
part 'chat_details_sheet.dart';
part 'chat_ai_sections.dart';

Future<void> showChatCreateConversationSheet({
  required BuildContext context,
  required ChatCubit cubit,
}) {
  return showAppSheet<void>(
    context: context,
    useRootNavigator: true,
    size: AppSheetSize.large,
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: const ChatCreateConversationSheet(),
    ),
  );
}

Future<void> showChatDirectorySheet({
  required BuildContext context,
  required ChatCubit cubit,
}) {
  return showAppSheet<void>(
    context: context,
    useRootNavigator: true,
    size: AppSheetSize.large,
    builder: (_) =>
        BlocProvider.value(value: cubit, child: const ChatDirectorySheet()),
  );
}

Future<void> showChatDetailsSheet({
  required BuildContext context,
  required ChatCubit cubit,
  String? currentUserId,
}) {
  return showAppSheet<void>(
    context: context,
    useRootNavigator: true,
    size: AppSheetSize.large,
    maxDialogWidth: 680,
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: ChatDetailsSheet(currentUserId: currentUserId),
    ),
  );
}
