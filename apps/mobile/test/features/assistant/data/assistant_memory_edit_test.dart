import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';

const oldRevision = 'v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const newRevision = 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

class _Api extends ApiClient {
  final calls = <(String, Map<String, dynamic>?)>[];
  Map<String, dynamic> response = {
    'memory': {
      'id': 'memory/a',
      'content': 'Canonical',
      'revision': oldRevision,
    },
  };
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    calls.add((path, null));
    return response;
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    calls.add((path, body));
    return response;
  }
}

void main() {
  test('reads canonical item revision through encoded '
      'scoped endpoint', () async {
    final api = _Api();
    final repo = AssistantPersonalSettingsRepository(
      ownerId: 'actor-a',
      api: api,
    );
    final memory = await repo.readMemoryForEdit('workspace/a', 'memory/a');
    expect(memory.content, 'Canonical');
    expect(memory.revision, oldRevision);
    expect(api.calls.single, (
      '/api/v1/workspaces/workspace%2Fa/ai/memory/items'
          '/memory%2Fa?product=mira',
      null,
    ));
  });
  for (final audit in [true, false]) {
    test(
      'real repository PATCH decodes saved receipt with audit=$audit',
      () async {
        final api = _Api()
          ..response = {
            'updated': true,
            'memory': {
              'id': 'memory/a',
              'content': 'Changed',
              'revision': newRevision,
            },
            'auditRecorded': audit,
            'warning': audit ? null : 'audit_failed',
          };
        final repo = AssistantPersonalSettingsRepository(
          ownerId: 'actor-a',
          api: api,
        );
        final receipt = await repo.editMemory(
          'workspace/a',
          'memory/a',
          value: 'Changed',
          revision: oldRevision,
        );
        expect(receipt.auditRecorded, audit);
        expect(receipt.memory.content, 'Changed');
        expect(
          api.calls.single.$1,
          '/api/v1/workspaces/workspace%2Fa/ai/memory/items'
          '/memory%2Fa?product=mira',
        );
        expect(api.calls.single.$2, {
          'value': 'Changed',
          'revision': oldRevision,
        });
      },
    );
  }
  for (final invalid in [
    {'id': 'foreign', 'content': 'Canonical', 'revision': oldRevision},
    {'id': 'memory/a', 'content': 'Canonical', 'revision': 'date-or-missing'},
    {'id': 'memory/a', 'revision': oldRevision},
  ]) {
    test('rejects invalid canonical read $invalid', () async {
      final api = _Api()..response = {'memory': invalid};
      final repo = AssistantPersonalSettingsRepository(
        ownerId: 'actor-a',
        api: api,
      );
      await expectLater(
        repo.readMemoryForEdit('workspace/a', 'memory/a'),
        throwsFormatException,
      );
    });
  }
  final valid = {
    'updated': true,
    'memory': {'id': 'memory/a', 'content': 'Changed', 'revision': newRevision},
    'auditRecorded': true,
    'warning': null,
  };
  for (final invalid in [
    <String, dynamic>{},
    {...valid, 'updated': false},
    {...valid, 'auditRecorded': null},
    {...valid, 'auditRecorded': false, 'warning': null},
    {
      ...valid,
      'memory': {
        'id': 'memory/a',
        'content': 'Changed',
        'revision': oldRevision,
      },
    },
    {
      ...valid,
      'memory': {
        'id': 'foreign',
        'content': 'Changed',
        'revision': newRevision,
      },
    },
    {
      ...valid,
      'memory': {
        'id': 'memory/a',
        'content': 'Unexpected',
        'revision': newRevision,
      },
    },
  ]) {
    test('rejects unconfirmed edit receipt $invalid', () async {
      final api = _Api()..response = invalid;
      final repo = AssistantPersonalSettingsRepository(
        ownerId: 'actor-a',
        api: api,
      );
      await expectLater(
        repo.editMemory(
          'workspace',
          'memory/a',
          value: 'Changed',
          revision: oldRevision,
        ),
        throwsFormatException,
      );
    });
  }
}
