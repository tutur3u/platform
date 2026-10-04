import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/data/task_broadcast_client.dart';

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'https://example.test');
  int closes = 0;
  @override
  void dispose() {
    closes++;
    super.dispose();
  }
}

void main() {
  test('injected factory-created client remains caller owned', () async {
    final api = _Api();
    final client = defaultTaskBroadcastClient(createApiClient: () => api);
    final borrowed = TaskBroadcastOwner(client);
    await closeOwnedTaskBroadcastClient(borrowed, null);
    expect(api.closes, 0);
    await closeOwnedTaskBroadcastClient(client, null);
    expect(api.closes, 1);
  });
  test('default owned API closes once even without subscriptions', () async {
    final api = _Api();
    final client = defaultTaskBroadcastClient(createApiClient: () => api);
    await closeOwnedTaskBroadcastClient(client, null);
    await closeOwnedTaskBroadcastClient(client, null);
    expect(api.closes, 1);
  });
  test('owned API closes when subscription cancellation fails', () async {
    final api = _Api();
    final client = defaultTaskBroadcastClient(createApiClient: () => api);
    await expectLater(
      closeOwnedTaskBroadcastClient(
        client,
        TaskBroadcastSubscription(
          () async => throw StateError('cancel failed'),
        ),
      ),
      throwsStateError,
    );
    expect(api.closes, 1);
  });
  test(
    'injected shared client cancels subscription without disposing API',
    () async {
      final api = _Api();
      final client = CloudflareTaskBroadcastClient(apiClient: api);
      var cancelled = false;
      await closeOwnedTaskBroadcastClient(
        client,
        TaskBroadcastSubscription(() async {
          cancelled = true;
        }),
      );
      expect(cancelled, isTrue);
      expect(api.closes, 0);
      client.dispose();
      expect(api.closes, 0);
      api.dispose();
    },
  );
}
