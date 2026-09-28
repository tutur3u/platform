import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_id_reconciliation.dart';

void main() {
  test('rewrites only complete local IDs in paths and structured payloads', () {
    final resolved = reconcileOfflineIds(
      '/api/items/local-1/entries?parent=local-1',
      {
        'collection_id': 'local-1',
        'nested': ['local-1', 'prefix-local-1'],
        'content': 'Keep local-1 in prose',
      },
      {'local-1': 'server-9'},
    );

    expect(resolved.path, '/api/items/server-9/entries?parent=server-9');
    expect(resolved.payload?['collection_id'], 'server-9');
    expect(resolved.payload?['nested'], ['server-9', 'prefix-local-1']);
    expect(resolved.payload?['content'], 'Keep local-1 in prose');
  });

  test('finds IDs in supported create response envelopes', () {
    expect(createdServerId({'id': 'top'}), 'top');
    expect(
      createdServerId({
        'tracker': {'id': 'nested'},
      }),
      'nested',
    );
    expect(createdServerId({'status': 'ok'}), isNull);
  });
}
