import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  const path = '/api/v1/workspaces/ws/user-groups/group/posts';
  late _Api api;
  late CrmRepository repository;
  setUp(() {
    api = _Api();
    repository = CrmRepository(apiClient: api);
    addTearDown(repository.dispose);
  });

  test('reads the exact group page and terminates a repeated cursor', () async {
    const cursor = '2026-11-23T15:14:13+00:00';
    final query = Uri(queryParameters: {'limit': '20', 'cursor': cursor});
    when(() => api.getJson('$path$query')).thenAnswer(
      (_) async => {
        'data': [
          {'id': 'post', 'title': 'Title', 'content': 'Body', 'notes': 'Note'},
        ],
        'nextCursor': cursor,
      },
    );
    final result = await repository.getGroupPostsPage(
      'ws',
      'group',
      cursor: cursor,
    );
    expect(result.posts.single.id, 'post');
    expect(result.posts.single.content, 'Body');
    expect(result.posts.single.notes, 'Note');
    expect(result.nextCursor, isNull);
  });

  test(
    'passes the exact PUT scope and requires an explicit acknowledgement',
    () async {
      Future<void> guard() async {}
      const changes = {'notes': null, 'title': 'Revised'};
      var acknowledged = true;
      when(
        () => api.putJsonGuarded(
          '$path/post%2Fid',
          changes,
          beforeDispatch: guard,
        ),
      ).thenAnswer((_) async => {if (acknowledged) 'message': 'success'});
      await repository.updateGroupPost(
        'ws',
        'group',
        'post/id',
        changes,
        beforeDispatch: guard,
      );
      acknowledged = false;
      await expectLater(
        repository.updateGroupPost(
          'ws',
          'group',
          'post/id',
          changes,
          beforeDispatch: guard,
        ),
        throwsStateError,
      );
    },
  );
}
