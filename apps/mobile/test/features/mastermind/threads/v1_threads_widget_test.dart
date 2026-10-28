import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/threads/v1_threads_page.dart';
import 'package:mobile/l10n/l10n.dart';

class V1Source implements MastermindSnapshotSource {
  int reads = 0;
  @override
  bool get isConfigured => true;
  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) async {
    reads++;
    return SnapshotFetch.ok(
      Uint8List.fromList(
        File(
          'test/features/mastermind/threads/v1_sample_redacted.json',
        ).readAsBytesSync(),
      ),
      DateTime.utc(2026),
      digest: 'test',
    );
  }

  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async => throw StateError('The list must not request history or events');
}

void main() {
  testWidgets(
    'v1 list uses lane id key, filters and search without a history route',
    (tester) async {
      final source = V1Source();
      final router = GoRouter(
        initialLocation: '/mastermind/threads',
        routes: [
          GoRoute(
            path: '/mastermind/threads',
            builder: (_, _) => Scaffold(body: V1ThreadsList(source: source)),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('item-cccccccccccccccccccc')),
        findsOneWidget,
      );
      expect(find.text('[Atlas] Mastermind'), findsOneWidget);
      expect(source.reads, 1);
      await tester.tap(find.text('Running 0'));
      await tester.pumpAndSettle();
      expect(find.text('[Atlas] Mastermind'), findsNothing);
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'atlas');
      await tester.pumpAndSettle();
      expect(find.text('[Atlas] Mastermind'), findsOneWidget);
      expect(source.reads, 1);
    },
  );
}
