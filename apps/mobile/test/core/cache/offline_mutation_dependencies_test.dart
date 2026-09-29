import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';

void main() {
  test('finds structured cross-module references to local IDs', () {
    expect(
      referencesPendingEntity('/api/notes', {
        'content': {
          'type': 'mention',
          'attrs': {'entityType': 'task', 'entityId': 'local-task'},
        },
      }, 'local-task'),
      isTrue,
    );
    expect(
      referencesPendingEntity(
        '/api/sales/local-sale/period',
        null,
        'local-sale',
      ),
      isTrue,
    );
    expect(
      referencesPendingEntity('/api/notes', {
        'content': 'Text says local-task in prose',
      }, 'local-task'),
      isFalse,
    );
  });

  test('finds task image markers only in descriptions', () {
    const marker = 'offline-task-image-12345678-1234-1234-1234-123456789abc';
    expect(
      referencesPendingEntity('/api/tasks', {
        'description': 'Photo ![]($marker)',
      }, marker),
      isTrue,
    );
    expect(
      referencesPendingEntity('/api/tasks', {
        'content': 'Photo ![]($marker)',
      }, marker),
      isFalse,
    );
  });
}
