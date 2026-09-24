import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/meet/data/meet_personal_chat.dart';

class _Request {
  const _Request(this.id, this.startedAt, this.history);

  final String id;
  final int startedAt;
  final List<Map<String, dynamic>> history;
}

class _FakeMeetRepository extends MeetRepository {
  final requests = <_Request>[];
  final outcomes = <Object?>[];

  @override
  Future<String> askPersonalMira(
    String wsId,
    String meetingId, {
    required String requestId,
    required int startedAt,
    required String question,
    required String timezone,
    required List<Map<String, dynamic>> history,
  }) async {
    requests.add(_Request(requestId, startedAt, history));
    final outcome = outcomes.removeAt(0);
    if (outcome is Exception) throw outcome;
    if (outcome is String) return outcome;
    throw StateError('Unexpected fake response');
  }
}

void main() {
  test('retry reuses the receipt ID and keeps the answer private', () async {
    final repository = _FakeMeetRepository()
      ..outcomes.addAll([Exception('network'), 'Private answer']);
    final chat = MeetPersonalChat(
      workspaceId: 'workspace',
      meetingId: 'meeting',
      repository: repository,
      timezoneLoader: () async => 'Asia/Ho_Chi_Minh',
    );

    expect(await chat.ask('Question'), isFalse);
    expect(chat.turns, isEmpty);
    expect(await chat.ask('Question'), isTrue);

    expect(repository.requests[1].id, repository.requests[0].id);
    expect(repository.requests[1].startedAt, repository.requests[0].startedAt);
    expect(repository.requests[1].history, isEmpty);
    expect(chat.turns.map((turn) => turn.body), ['Question', 'Private answer']);
    chat.dispose();
    repository.dispose();
  });

  test('terminal receipt error permits a fresh request ID', () async {
    final repository = _FakeMeetRepository()
      ..outcomes.addAll([
        const ApiException(message: 'Expired', statusCode: 422),
        'Fresh answer',
      ]);
    final chat = MeetPersonalChat(
      workspaceId: 'workspace',
      meetingId: 'meeting',
      repository: repository,
      timezoneLoader: () async => 'UTC',
    );

    expect(await chat.ask('Question'), isFalse);
    expect(await chat.ask('Question'), isTrue);
    expect(repository.requests[1].id, isNot(repository.requests[0].id));
    chat.dispose();
    repository.dispose();
  });
}
