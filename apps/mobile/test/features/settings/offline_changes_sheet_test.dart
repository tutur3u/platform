import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  tearDown(() => OfflineMutationQueue.instance.pending.value = []);

  testWidgets('discard requires confirmation before removing a local edit', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    queue.pending.value = [
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'finance',
        method: 'PUT',
        path: '/api/v1/workspaces/ws-1/finance/transactions/tx-1',
        createdAt: DateTime.utc(2026, 9, 28),
        workspaceId: 'ws-1',
        userId: 'user-1',
        optimisticPatch: const {'entityId': 'tx-1'},
      ),
    ];
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showOfflineChangesSheet(context),
              child: const Text('Open changes'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard local change'));
    await tester.pumpAndSettle();

    expect(find.textContaining('does not undo'), findsOneWidget);
    expect(queue.pending.value, hasLength(1));
    final cancelLabel = MaterialLocalizations.of(
      tester.element(find.byType(AlertDialog)),
    ).cancelButtonLabel;
    await tester.tap(find.text(cancelLabel));
    await tester.pumpAndSettle();
    expect(queue.pending.value, hasLength(1));
  });
}
