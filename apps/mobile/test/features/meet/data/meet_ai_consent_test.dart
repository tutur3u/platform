import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_room_assistant.dart';

import '../../assistant/consent/mira_ai_consent_fakes.dart';

/// Records every Mira request, refusing them the way the server does without
/// AI data consent when [refuseConsent] is set.
class _Repository extends MeetRepository {
  final generated = <String>[];
  final decisions = <String>[];
  bool refuseConsent = false;

  @override
  Future<Map<String, dynamic>> askRoomMira(
    String wsId,
    String meetingId, {
    required String messageId,
    required String timezone,
  }) async {
    generated.add(messageId);
    if (refuseConsent) throw const MeetAiConsentRequiredException();
    return {'ok': true};
  }

  @override
  Future<List<dynamic>> listMiraReviews(String wsId, String meetingId) async =>
      const <dynamic>[];

  @override
  Future<Map<String, dynamic>> decideMiraReview(
    String wsId,
    String meetingId, {
    required String messageId,
    required int revision,
    required String action,
  }) async {
    decisions.add('$messageId:$action');
    if (refuseConsent) throw const MeetAiConsentRequiredException();
    return {'ok': true};
  }
}

http.Response _consentRefusal() => http.Response(
  jsonEncode({
    'code': 'ai_consent_required',
    'message': 'ai_consent_required',
  }),
  403,
  headers: {'content-type': 'application/json'},
);

void main() {
  late _Repository repository;
  late FakeMiraAiConsentGate gate;
  late MeetRoomAssistant assistant;

  setUp(() {
    repository = _Repository();
    gate = FakeMiraAiConsentGate();
    assistant = MeetRoomAssistant(
      workspaceId: 'workspace',
      meetingId: 'meeting',
      repository: repository,
      timezoneLoader: () async => 'UTC',
    )..aiConsentGate = gate;
  });

  tearDown(() {
    assistant.dispose();
    repository.dispose();
  });

  test('Not now on a room mention sends nothing', () async {
    expect(await assistant.admitAiConsent(), isFalse);
    await assistant.ask('message-1');

    expect(gate.requests, 2);
    expect(repository.generated, isEmpty);
    expect(assistant.consentRequired, isTrue);
    expect(assistant.retryMessageId, 'message-1');
  });

  test('Allow sends the room mention', () async {
    gate.allow = true;
    await assistant.ask('message-1');

    expect(gate.requests, 1);
    expect(repository.generated, ['message-1']);
    expect(assistant.error, isNull);
    expect(assistant.retryMessageId, isNull);
  });

  test('a server refusal is typed, asks again, never re-sends', () async {
    gate.granted = true;
    repository.refuseConsent = true;
    await assistant.ask('message-1');

    expect(repository.generated, ['message-1']);
    expect(gate.refusals, 1);
    expect(gate.granted, isFalse);
    expect(assistant.consentRequired, isTrue);
    expect(assistant.retryMessageId, 'message-1');
  });

  test('a review decision without consent is not sent', () async {
    final sent = await assistant.decide(
      messageId: 'message-1',
      revision: 1,
      action: 'approve',
    );

    expect(sent, isFalse);
    expect(gate.requests, 1);
    expect(repository.decisions, isEmpty);
  });

  test('a refused review decision throws the typed failure', () async {
    gate.granted = true;
    repository.refuseConsent = true;

    await expectLater(
      assistant.decide(messageId: 'message-1', revision: 1, action: 'deny'),
      throwsA(isA<MeetAiConsentRequiredException>()),
    );
    expect(repository.decisions, ['message-1:deny']);
    expect(gate.refusals, 1);
  });

  test('the repository types a 403 ai_consent_required', () async {
    final paths = <String>[];
    final meet = MeetRepository(
      apiClient: syntheticAuthedApi((request) async {
        paths.add(request.url.path);
        return _consentRefusal();
      }),
    );
    addTearDown(meet.dispose);

    await expectLater(
      meet.askPersonalMira(
        'workspace',
        'meeting',
        requestId: 'request-1',
        startedAt: 1,
        question: 'Summarize',
        timezone: 'UTC',
        history: const [],
      ),
      throwsA(isA<MeetAiConsentRequiredException>()),
    );
    await expectLater(
      meet.askRoomMira('workspace', 'meeting', messageId: 'm', timezone: 'UTC'),
      throwsA(isA<MeetAiConsentRequiredException>()),
    );
    expect(paths, [
      '/api/v1/workspaces/workspace/meetings/meeting/assistant/personal',
      '/api/v1/workspaces/workspace/meetings/meeting/assistant',
    ]);
  });
}
