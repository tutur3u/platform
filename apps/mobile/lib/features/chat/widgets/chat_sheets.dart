import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
  return showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
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
  return showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    builder: (_) =>
        BlocProvider.value(value: cubit, child: const ChatDirectorySheet()),
  );
}

Future<void> showChatSearchSheet({
  required BuildContext context,
  required ChatCubit cubit,
}) {
  return showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    builder: (_) =>
        BlocProvider.value(value: cubit, child: const ChatSearchSheet()),
  );
}

Future<void> showChatDetailsSheet({
  required BuildContext context,
  required ChatCubit cubit,
}) {
  return showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    maxDialogWidth: 680,
    builder: (_) =>
        BlocProvider.value(value: cubit, child: const ChatDetailsSheet()),
  );
}
