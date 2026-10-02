import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

void main() {
  tearDown(() => OfflineMutationQueue.instance.pending.value = []);

  testWidgets('later matching syncing edit takes status priority', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    addTearDown(() => queue.syncingIds.value = {});
    queue.pending.value = [
      for (final id in ['queued', 'active'])
        PendingMutationRecord(
          id: id,
          feature: 'notes',
          method: 'PUT',
          path: '/api/v1/workspaces/ws-1/notes/note-1',
          createdAt: DateTime.utc(2026, 9, 28),
          workspaceId: 'ws-1',
          userId: 'user-1',
          optimisticPatch: const {'entityId': 'note-1'},
        ),
    ];
    queue.syncingIds.value = {'active'};
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: PendingSyncFrame(
            workspaceId: 'ws-1',
            entityId: 'note-1',
            feature: 'notes',
            child: Text('Edited note'),
          ),
        ),
      ),
    );
    expect(find.text('Syncing…'), findsOneWidget);
    expect(find.text('Waiting to sync'), findsNothing);
  });

  testWidgets('queued item is visibly muted and outlined until synced', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    queue.pending.value = [
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'notes',
        method: 'PUT',
        path: '/api/v1/workspaces/ws-1/notes/note-1',
        createdAt: DateTime.utc(2026, 9, 28),
        workspaceId: 'ws-1',
        userId: 'user-1',
        optimisticPatch: const {'entityId': 'note-1'},
      ),
    ];
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: PendingSyncFrame(
            workspaceId: 'ws-1',
            entityId: 'note-1',
            feature: 'notes',
            child: Text('Edited note'),
          ),
        ),
      ),
    );

    expect(find.text('Waiting to sync'), findsOneWidget);
    expect(
      tester
          .widgetList<Opacity>(find.byType(Opacity))
          .any((opacity) => opacity.opacity == 0.64),
      isTrue,
    );
    expect(find.byType(CustomPaint), findsWidgets);

    queue.pending.value = [];
    await tester.pump();
    expect(find.text('Waiting to sync'), findsNothing);
    expect(find.text('Edited note'), findsOneWidget);
  });
}
