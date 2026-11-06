import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_secret.dart';

void main() {
  group('WorkspaceSecret.fromJson', () {
    test('parses every field', () {
      final secret = WorkspaceSecret.fromJson({
        'id': 's1',
        'ws_id': 'w1',
        'name': 'API_KEY',
        'value': 'v',
        'created_at': '2026-10-01T10:00:00.000Z',
      });

      expect(secret.id, 's1');
      expect(secret.wsId, 'w1');
      expect(secret.name, 'API_KEY');
      expect(secret.value, 'v');
      expect(secret.createdAt, DateTime.utc(2026, 10, 1, 10));
    });

    test('treats blank id, ws id and name as missing', () {
      final secret = WorkspaceSecret.fromJson({
        'id': ' ',
        'ws_id': '',
        'name': '  ',
      });

      expect(secret.id, isNull);
      expect(secret.wsId, isNull);
      expect(secret.name, isNull);
    });

    test('keeps a blank value but stringifies non-string values', () {
      expect(WorkspaceSecret.fromJson({'value': ''}).value, '');
      expect(WorkspaceSecret.fromJson({'value': 12}).value, '12');
      expect(WorkspaceSecret.fromJson({'value': null}).value, isNull);
    });

    test('ignores unparsable or non-string dates', () {
      expect(
        WorkspaceSecret.fromJson({'created_at': 'soon'}).createdAt,
        isNull,
      );
      expect(WorkspaceSecret.fromJson({'created_at': 123}).createdAt, isNull);
    });

    test('parses an empty payload to all nulls', () {
      final secret = WorkspaceSecret.fromJson(const {});

      expect(secret.id, isNull);
      expect(secret.value, isNull);
      expect(secret.createdAt, isNull);
    });
  });

  group('WorkspaceSecret.toJson', () {
    test('serialises with snake_case keys and an ISO timestamp', () {
      final secret = WorkspaceSecret(
        id: 's1',
        wsId: 'w1',
        name: 'N',
        value: 'v',
        createdAt: DateTime.utc(2026, 10),
      );

      expect(secret.toJson(), {
        'id': 's1',
        'ws_id': 'w1',
        'name': 'N',
        'value': 'v',
        'created_at': '2026-10-01T00:00:00.000Z',
      });
    });

    test('writes nulls for absent fields and round-trips', () {
      const secret = WorkspaceSecret();
      final json = secret.toJson();

      expect(json.values, everyElement(isNull));
      expect(WorkspaceSecret.fromJson(json).toJson(), json);
    });
  });

  group('WorkspaceSecret.copyWith', () {
    test('replaces only the provided fields', () {
      final original = WorkspaceSecret(
        id: 's1',
        wsId: 'w1',
        name: 'N',
        value: 'v',
        createdAt: DateTime.utc(2026, 10),
      );
      final copy = original.copyWith(name: 'N2', value: 'v2');

      expect(copy.id, 's1');
      expect(copy.wsId, 'w1');
      expect(copy.name, 'N2');
      expect(copy.value, 'v2');
      expect(copy.createdAt, original.createdAt);
    });

    test('keeps existing values when no overrides are given', () {
      const original = WorkspaceSecret(id: 's1', value: 'v');

      expect(original.copyWith().value, 'v');
    });
  });
}
