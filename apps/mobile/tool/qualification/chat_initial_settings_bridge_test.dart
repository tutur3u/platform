import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

Map<String, dynamic> object(Object? value) {
  if (value is Map<String, dynamic>) return value;
  throw const FormatException('Bridge object required');
}

String text(Object? value) {
  if (value is String) return value;
  throw const FormatException('Bridge string required');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(() => true);
  final env = Platform.environment;
  final webPath = env['CHAT_INITIAL_SETTINGS_WEB_RESULT'];
  final sqlPath = env['CHAT_INITIAL_SETTINGS_ENVELOPE'];
  final resultPath = env['CHAT_INITIAL_SETTINGS_DART_RESULT'];
  if (webPath == null || sqlPath == null || resultPath == null) {
    throw const FormatException('Actual SQL/Web bridge files required');
  }
  final web = object(jsonDecode(File(webPath).readAsStringSync()));
  final binding = object(web['binding']);
  final casesValue = web['cases'];
  if (casesValue is! List<dynamic> || casesValue.length != 4) {
    throw const FormatException('Four actual SQL/Web cases required');
  }
  final cases = casesValue.map(object).toList(growable: false);
  final names = ['workspace', 'personal', 'null', 'legacy'];
  final passed = <String>[];
  final envelopeHash = sha256
      .convert(File(sqlPath).readAsBytesSync())
      .toString();
  setUpAll(() {
    expect(cases.map((item) => item['name']).toList(), names);
    expect(binding['sourceSha'], env['EMPLOYEE_SCHEMA_SOURCE_SHA']);
    expect(binding['controlSha'], env['EMPLOYEE_SCHEMA_CONTROL_SHA']);
    expect(binding['runId'], env['GITHUB_RUN_ID']);
    expect(web['envelopeSha256'], envelopeHash);
  });

  Future<AcknowledgedChatConversation> create(
    Map<String, dynamic> item,
    Map<String, dynamic> response,
  ) async {
    final actor = text(item['actorId']);
    final workspace = text(item['wsId']);
    final input = object(item['input']);
    final api = _Api();
    final path = '/api/v1/workspaces/$workspace/chat/conversations';
    when(
      () => api.postJsonAcknowledged(
        path,
        any(),
        actorId: actor,
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((call) async {
      final current = call.namedArguments[#isCurrent];
      expect(current, isA<bool Function()>());
      if (current is! bool Function()) throw StateError('Lease missing');
      expect(current(), isTrue);
      expect(call.positionalArguments[1], input);
      return response;
    });
    final repository = ChatRepository(apiClient: api);
    try {
      return await repository.createAcknowledgedConversation(
        workspace,
        title: text(input['title']),
        modelId: text(input['modelId']),
        actorId: actor,
        isCurrent: () => true,
        initialSettings: input['initialAiSettings'] == null
            ? null
            : ChatInitialAiSettings.fromJson(
                object(input['initialAiSettings']),
              ),
      );
    } finally {
      verify(
        () => api.postJsonAcknowledged(
          path,
          any(),
          actorId: actor,
          isCurrent: any(named: 'isCurrent'),
        ),
      ).called(1);
      verifyNever(() => api.postJson(any(), any()));
      verifyNoMoreInteractions(api);
      repository.dispose();
    }
  }

  for (final item in cases) {
    test(text(item['name']), () async {
      final response = object(item['response']);
      final result = await create(item, response);
      expect(result.conversation.id, object(item['receipt'])['id']);
      expect(result.conversation.wsId, item['wsId']);
      // Feed the exact actual Web body; do not reformat the SQL timestamp here.
      final receipt = object(response['conversation']);
      expect(receipt['createdAt'], contains('T'));
      expect(receipt['createdAt'], endsWith('Z'));
      expect(
        result.conversation.createdAt,
        DateTime.parse(text(receipt['createdAt'])),
      );
      passed.add(text(item['name']));
    });
  }
  for (final name in [
    'invalid_calendar',
    'wrong_workspace',
    'wrong_actor',
    'wrong_tuple',
  ]) {
    test(name, () async {
      final first = cases.first;
      final response = object(jsonDecode(jsonEncode(first['response'])));
      final receipt = object(response['conversation']);
      switch (name) {
        case 'invalid_calendar':
          receipt['createdAt'] = '2026-02-29T00:00:00.123456Z';
        case 'wrong_workspace':
          receipt['wsId'] = first['personalWsId'];
        case 'wrong_actor':
          receipt['createdBy'] = first['personalWsId'];
        case 'wrong_tuple':
          object(receipt['initialAiSettings'])['thinkingMode'] = 'fast';
      }
      await expectLater(create(first, response), throwsFormatException);
      passed.add(name);
    });
  }
  test('raw_sql_requires_web', () {
    for (final item in cases) {
      final input = object(item['input']);
      expect(
        () => AcknowledgedChatConversation.fromResponse(
          {'conversation': item['receipt']},
          wsId: text(item['wsId']),
          actorId: text(item['actorId']),
          initialSettings: input['initialAiSettings'] == null
              ? null
              : ChatInitialAiSettings.fromJson(
                  object(input['initialAiSettings']),
                ),
        ),
        throwsFormatException,
      );
    }
    passed.add('raw_sql_requires_web');
  });
  tearDownAll(() {
    final expected = [
      ...names,
      'invalid_calendar',
      'wrong_workspace',
      'wrong_actor',
      'wrong_tuple',
      'raw_sql_requires_web',
    ];
    expect(passed, expected);
    File(resultPath).writeAsStringSync(
      jsonEncode({
        'binding': binding,
        'envelopeSha256': envelopeHash,
        'passed': expected,
        'providerCalls': 0,
      }),
    );
  });
}
