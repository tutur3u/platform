import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_render_ui.dart';
import 'package:mocktail/mocktail.dart';

class _FinanceRepository extends Mock implements FinanceRepository {}

class _TimeTrackerRepository extends Mock implements TimeTrackerRepository {}

class _FailingClient extends Mock implements HttpClient {}

class _OfflineImages {
  HttpClient createHttpClient() {
    final client = _FailingClient();
    when(() => client.autoUncompress = any()).thenReturn(true);
    when(() => client.getUrl(any())).thenAnswer(
      (_) async => throw const SocketException('Synthetic offline image'),
    );
    return client;
  }
}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.invalid/avatar.png'));
  });

  testWidgets('assistant avatar keeps fallback on offline image failure', (
    tester,
  ) async {
    final previous = debugNetworkImageHttpClientProvider;
    debugNetworkImageHttpClientProvider = _OfflineImages().createHttpClient;
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: AssistantRenderUi(
            output: const {
              'root': 'avatar',
              'elements': {
                'avatar': {
                  'type': 'Avatar',
                  'props': {
                    'src': 'https://example.invalid/avatar.png',
                    'fallback': 'AB',
                  },
                },
              },
            },
            wsId: 'synthetic-workspace',
            submitText: (_) async {},
            financeRepository: _FinanceRepository(),
            timeTrackerRepository: _TimeTrackerRepository(),
            tasksInsight: const AssistantTasksInsight(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('AB'), findsOneWidget);
    } finally {
      debugNetworkImageHttpClientProvider = previous;
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
}
