import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';

void main() {
  group('userScopedCacheKey', () {
    test('partitions identical cache ids by user identity', () {
      expect(
        userScopedCacheKey('workspace:personal', userId: 'user-1'),
        isNot(userScopedCacheKey('workspace:personal', userId: 'user-2')),
      );
    });

    test('keeps the original cache id readable', () {
      expect(
        userScopedCacheKey('workspace:personal', userId: 'user-1'),
        contains('workspace:personal'),
      );
    });

    test('uses deterministic anonymous namespace without user id', () {
      final keyA = userScopedCacheKey('workspace:personal');
      final keyB = userScopedCacheKey('workspace:personal');

      expect(keyA, contains('workspace:personal'));
      expect(keyA, contains('anonymous'));
      expect(keyA, keyB);
    });
  });
}
