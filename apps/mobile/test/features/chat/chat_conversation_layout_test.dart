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
  for (final loading in [false, true]) {
    testWidgets('short list auto-load respects in-flight=$loading', (
      tester,
    ) async {
      var requests = 0;
      await tester.pumpApp(
        SizedBox(
          height: 400,
          child: ChatConversationList(
            conversations: [
              ChatConversation(
                id: 'one',
                wsId: 'workspace',
                type: ChatConversationType.direct,
                updatedAt: DateTime(2026),
              ),
            ],
            selectedConversationId: null,
            onSelected: (_) {},
            onLoadMore: () => requests++,
            hasMore: true,
            isLoadingMore: loading,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(requests, loading ? 0 : 1);
      // Repeated layout/scroll frames after a failed or empty request do not loop.
      await tester.pump();
      expect(requests, loading ? 0 : 1);
    });
  }

  testWidgets('long list loads before the end and retains manual retry', (
    tester,
  ) async {
    var requests = 0;
    await tester.pumpApp(
      SizedBox(
        height: 300,
        child: ChatConversationList(
          conversations: List.generate(
            20,
            (i) => ChatConversation(
              id: '$i',
              wsId: 'workspace',
              type: ChatConversationType.direct,
              updatedAt: DateTime(2026),
              title: 'Conversation $i',
            ),
          ),
          selectedConversationId: null,
          onSelected: (_) {},
          onLoadMore: () => requests++,
          hasMore: true,
          isLoadingMore: false,
        ),
      ),
    );
    await tester.pump();
    expect(requests, 0);
    final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
    scroll.position.jumpTo(scroll.position.maxScrollExtent - 100);
    await tester.pump();
    await tester.pump();
    expect(requests, 1);
    scroll.position.jumpTo(scroll.position.maxScrollExtent);
    await tester.pump();
    await tester.tap(find.text('Load more'));
    expect(requests, 2);
  });
}
