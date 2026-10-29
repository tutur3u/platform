import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notes/note_link_picker_sheet.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  for (final failed in [false, true]) {
    testWidgets('note picker retries $failed without a cold loader', (
      tester,
    ) async {
      final api = _Api();
      var reads = 0;
      final pending = Completer<Map<String, dynamic>>();
      when(() => api.getJson(any())).thenAnswer((_) async {
        reads++;
        if (reads > 1) return await pending.future;
        if (failed) throw Exception('offline');
        return {'tasks': <Object>[]};
      });
      await tester.pumpApp(
        Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showNoteLinkPickerSheet(
                context,
                wsId: 'workspace',
                apiClient: api,
              ),
              child: const Text('Open links'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open links'));
      await tester.pumpAndSettle();
      expect(reads, 1);
      await tester.drag(
        find.byType(NovaRefreshIndicator),
        const Offset(0, 450),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(reads, 2);
      expect(find.byType(NovaLoadingIndicator), findsOneWidget);
      pending.complete({
        'tasks': [
          {'id': 'new-task', 'name': 'New task'},
        ],
      });
      await tester.pumpAndSettle();
      expect(find.text('New task'), findsOneWidget);
      expect(find.byType(NovaLoadingIndicator), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
    });
  }
}
