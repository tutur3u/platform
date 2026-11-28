import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/report/mira_response_report.dart';
import 'package:mobile/features/assistant/report/mira_response_report_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';

import '../../../helpers/helpers.dart';
import '../consent/mira_ai_consent_fakes.dart';

const _workspace = '22222222-2222-4222-8222-222222222222';
const _conversation = 'ai-chat-55555555-5555-4555-8555-555555555555';
const _reply = '88888888-8888-4888-8888-000000000001';

void main() {
  late List<http.Request> requests;
  late MiraResponseReportRepository repository;
  late List<bool> results;

  setUp(() {
    requests = [];
    results = [];
    final api = syntheticAuthedApi((request) async {
      requests.add(request);
      return http.Response(
        jsonEncode({'reportId': 'report', 'blocked': false}),
        201,
        headers: {'content-type': 'application/json'},
      );
    });
    addTearDown(api.dispose);
    repository = MiraResponseReportRepository(apiClient: api);
  });

  Future<void> openSheet(WidgetTester tester) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => Center(
          child: TextButton(
            onPressed: () async => results.add(
              await showMiraResponseReportSheet(
                context,
                target: (
                  wsId: _workspace,
                  conversationId: _conversation,
                  messageId: _reply,
                ),
                repository: repository,
              ),
            ),
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets('sends an ai_response report with the reason and details', (
    tester,
  ) async {
    await openSheet(tester);

    expect(find.text('Report this response'), findsWidgets);
    expect(
      find.textContaining('the message before it to improve Mira'),
      findsOneWidget,
    );
    expect(find.text('Offensive or hateful'), findsOneWidget);
    expect(find.text('Wrong or made up'), findsOneWidget);
    final send = find.byKey(const ValueKey('mira-report-send'));
    expect(tester.widget<AppButton>(send).onPressed, isNull);

    await tester.tap(
      find.byKey(const ValueKey('mira-report-reason-inaccurate')),
    );
    await tester.pump();
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('mira-report-details')),
        matching: find.byType(EditableText),
      ),
      '  It said the meeting was on Friday.  ',
    );
    await tester.tap(send);
    await tester.pumpAndSettle();

    expect(results, [true]);
    expect(requests, hasLength(1));
    expect(
      requests.single.url.path,
      '/api/v1/workspaces/$_workspace/chat/reports',
    );
    expect(jsonDecode(requests.single.body), {
      'subjectType': 'ai_response',
      'conversationId': _conversation,
      'messageId': _reply,
      'reason': 'inaccurate',
      'details': 'It said the meeting was on Friday.',
    });
  });

  testWidgets('the details field has a placeholder', (tester) async {
    await openSheet(tester);

    final field = tester.widget<AppTextField>(
      find.byKey(const ValueKey('mira-report-details')),
    );
    expect(field.placeholder, 'What should Mira have said?');
  });

  for (final reportable in [true, false]) {
    testWidgets(
      'reply actions ${reportable ? 'offer' : 'hide'} Report this response',
      (tester) async {
        var reports = 0;
        await tester.pumpApp(
          AssistantTranscriptBubble(
            label: 'Mira',
            alignEnd: false,
            text: 'Synthetic reply',
            transcript: '',
            attachments: const [],
            timestamp: null,
            toolNames: const [],
            onReport: reportable ? () => reports++ : null,
          ),
        );
        await tester.longPress(
          find.byKey(const ValueKey('assistant-message-content')),
        );
        await tester.pumpAndSettle();

        final action = find.byKey(const ValueKey('assistant-report-response'));
        expect(action, reportable ? findsOneWidget : findsNothing);
        if (reportable) {
          await tester.tap(action);
          await tester.pumpAndSettle();
          expect(reports, 1);
        }
      },
    );
  }
}
