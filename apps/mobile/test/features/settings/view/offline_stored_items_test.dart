import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';
import 'package:mobile/features/settings/view/offline_stored_items.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

class _Store extends Mock implements CacheStore {}

class _CountedPayload {
  int calls = 0;
  Map<String, dynamic> toJson() {
    calls++;
    return {'large': List.filled(100, 'synthetic')};
  }
}

void main() {
  testWidgets('large collections render lazily '
      'and serialize only opened rows', (tester) async {
    final store = _Store();
    final payloads = List.generate(2000, (_) => _CountedPayload());
    final rows = [
      for (var i = 0; i < payloads.length; i++)
        ReplicaEntityRecord(
          id: 'synthetic-$i',
          namespace: 'inventory.products',
          sourceKey: 'synthetic-source',
          fetchedAt: DateTime.utc(2030),
          payload: {'name': 'Product $i', 'detail': payloads[i]},
        ),
    ];
    var reads = 0;
    Future<void> pump(String revision) => tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SingleChildScrollView(
            child: OfflineStoredItems(
              store: store,
              userId: 'synthetic-actor',
              workspaceId: 'synthetic-workspace',
              namespace: 'inventory.products',
              revision: revision,
              loadItems: () async {
                reads++;
                return rows;
              },
            ),
          ),
        ),
      ),
    );
    await pump('content-a');
    await tester.tap(find.text('Browse stored items'));
    await tester.pumpAndSettle();
    expect(reads, 1);
    expect(find.byType(ExpansionTile).evaluate().length, lessThan(20));
    expect(find.text('Product 1999'), findsNothing);
    expect(payloads.fold<int>(0, (sum, row) => sum + row.calls), 0);

    // Search covers a far-away item, not just the first rendered/read page.
    final search = find.byKey(
      const ValueKey(('offline-item-search', 'inventory.products')),
    );
    await tester.enterText(search, 'synthetic-1999');
    await tester.pumpAndSettle();
    expect(find.text('Product 1999'), findsOneWidget);
    expect(payloads.last.calls, 0);
    await tester.tap(find.text('Product 1999'));
    await tester.pumpAndSettle();
    expect(find.text('Item ID: synthetic-1999'), findsOneWidget);
    expect(payloads.last.calls, 1);
    await tester.tap(find.text('Product 1999'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Product 1999'));
    await tester.pumpAndSettle();
    expect(payloads.last.calls, 1);

    // Unrelated coordinator/status refreshes keep the same namespace revision.
    await pump('content-a');
    await tester.pumpAndSettle();
    expect(reads, 1);
    expect(find.text('Product 1999'), findsOneWidget);
    final editable = tester.widget<EditableText>(
      find.descendant(of: search, matching: find.byType(EditableText)),
    );
    expect(editable.controller.text, 'synthetic-1999');
    expect(payloads.last.calls, 1);

    await pump('content-b');
    await tester.pumpAndSettle();
    expect(reads, 2);
    expect(find.text('Product 1999'), findsOneWidget);
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      'synthetic-1999',
    );
    expect(payloads.fold<int>(0, (sum, row) => sum + row.calls), 2);
    await tester.tap(find.text('Browse stored items'));
    await tester.pumpAndSettle();
    rows[1999] = ReplicaEntityRecord(
      id: 'synthetic-1999',
      namespace: 'inventory.products',
      sourceKey: 'synthetic-source',
      fetchedAt: DateTime.utc(2031),
      payload: {'name': 'Updated product'},
    );
    await pump('content-c');
    await tester.pumpAndSettle();
    expect(reads, 2);
    await tester.tap(find.text('Browse stored items'));
    await tester.pumpAndSettle();
    expect(reads, 3);
    expect(find.text('Updated product'), findsOneWidget);
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      'synthetic-1999',
    );
    expect(tester.takeException(), isNull);
  });
}
