import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';

import '../../helpers/helpers.dart';

void main() {
  testWidgets('conversation remains reachable below tall filters', (
    tester,
  ) async {
    String? selected;
    await tester.pumpApp(
      Align(
        alignment: Alignment.topCenter,
        child: SizedBox(
          height: 200,
          child: ChatConversationList(
            header: const SizedBox(height: 350, child: Text('Filters')),
            conversations: [
              ChatConversation(
                id: 'conversation',
                wsId: 'workspace',
                type: ChatConversationType.ai,
                updatedAt: DateTime(2026),
                title: 'Reachable conversation',
              ),
            ],
            selectedConversationId: null,
            onSelected: (value) => selected = value,
            onLoadMore: () {},
            hasMore: false,
            isLoadingMore: false,
          ),
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reachable conversation'));
    expect(selected, 'conversation');
    expect(tester.takeException(), isNull);
  });
}
