import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_room_assistant.dart';

class _FakeMeetRepository extends MeetRepository {
  final generated = <String>[];
  final decisions = <String>[];
  bool rejectGeneration = false;

  @override
  Future<Map<String, dynamic>> askRoomMira(
    String wsId,
    String meetingId, {
    required String messageId,
    required String timezone,
  }) async {
    generated.add(messageId);
    if (rejectGeneration) throw StateError('Unavailable');
    return {'ok': true, 'reviewId': messageId};
  }

  @override
  Future<List<dynamic>> listMiraReviews(String wsId, String meetingId) async => [
    {'id': 'message-1', 'status': 'ready'},
  ];

  @override
  Future<Map<String, dynamic>> getMiraReview(
    String wsId,
    String meetingId,
    String messageId,
  ) async => {
    'revision': 2,
    'status': 'ready',
    'approvals': [
      {'toolName': 'create_task', 'input': {'name': 'Review first'}},
    ],
  };

  @override
  Future<Map<String, dynamic>> decideMiraReview(
    String wsId,
    String meetingId, {
    required String messageId,
    required int revision,
    required String action,
  }) async {
    decisions.add('$messageId:$revision:$action');
    return {'ok': true};
  }
}

void main() {
  test('room mentions trigger only for a standalone assistant handle', () {
    expect(MeetRoomAssistant.hasMention('Please help, @Mira!'), isTrue);
    expect(MeetRoomAssistant.hasMention('@ttr summarize'), isTrue);
    expect(MeetRoomAssistant.hasMention('person@mira.com'), isFalse);
    expect(MeetRoomAssistant.hasMention('@miracle'), isFalse);
  });

  test('failed generation can retry the same room message', () async {
    final repository = _FakeMeetRepository()..rejectGeneration = true;
    final assistant = MeetRoomAssistant(
      workspaceId: 'workspace',
      meetingId: 'meeting',
      repository: repository,
      timezoneLoader: () async => 'UTC',
    );

    await assistant.ask('message-1');
    expect(assistant.retryMessageId, 'message-1');
    expect(assistant.error, 'generation_failed');

    repository.rejectGeneration = false;
    await assistant.ask(assistant.retryMessageId!);
    expect(repository.generated, ['message-1', 'message-1']);
    expect(assistant.retryMessageId, isNull);
    expect(assistant.reviews.single['id'], 'message-1');

    await assistant.decide(
      messageId: 'message-1',
      revision: 2,
      action: 'approve',
    );
    expect(repository.decisions, ['message-1:2:approve']);
    assistant.dispose();
    repository.dispose();
  });
}
