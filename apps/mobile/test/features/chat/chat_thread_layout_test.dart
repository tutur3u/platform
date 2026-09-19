import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';

import '../../helpers/helpers.dart';

void main() {
  for (final height in [100.0, 200.0, 700.0]) {
    testWidgets('error thread keeps composer reachable at height $height', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(874, 1032);
      addTearDown(tester.view.reset);
      await tester.pumpApp(
        Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            height: height,
            child: ChatThreadView(
              conversation: ChatConversation(
                id: 'conversation',
                wsId: 'workspace',
                type: ChatConversationType.ai,
                updatedAt: DateTime(2026),
                title: 'Conversation',
              ),
              messages: const [],
              messageStatus: ChatMessageStatus.error,
              currentUserId: 'user',
              pendingAttachments: const [],
              streamingAssistantText: '',
              isSending: false,
              isUploadingAttachment: false,
              onSend: (_) {},
              onPickAttachment: (_) {},
              onRemoveAttachment: (_) {},
              onReaction: (_, _) {},
              onDetails: () {},
              onPin: () {},
            ),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.byType(ChatComposer).hitTestable(), findsOneWidget);
      expect(
        tester.getBottomLeft(find.byType(ChatComposer)).dy,
        lessThanOrEqualTo(height),
      );
    });
  }
}
