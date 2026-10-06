import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

class _Api extends ApiClient {
  final List<String> paths = [];
  final List<Map<String, dynamic>> writes = [];
  bool denied = false;
  bool malformed = false;
  bool deleted = true;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    paths.add(path);
    if (path == '/api/v1/mira/soul') {
      return {
        'soul': {'name': 'Nova'},
      };
    }
    if (denied) throw const FormatException('Synthetic unavailable memory');
    if (path.contains('/settings')) {
      return {
        'enabled': malformed ? null : false,
        'products': <String, dynamic>{'mira': false, 'ai_chat': true},
      };
    }
    return {
      'items': <dynamic>[
        {'id': 'memory-a', 'content': 'Synthetic preference'},
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    paths.add(path);
    writes.add(body);
    if (malformed) return <String, dynamic>{};
    return path == '/api/v1/mira/soul'
        ? {'soul': body}
        : {'enabled': body['enabled']};
  }

  @override
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    paths.add(path);
    return {'deleted': deleted};
  }
}

void main() {
  late _Api api;
  late AssistantPersonalSettingsRepository repository;
  final invalidated = <String>[];
  setUp(() {
    api = _Api();
    invalidated.clear();
    repository = AssistantPersonalSettingsRepository(
      ownerId: 'actor-a',
      api: api,
      invalidateSoul: (owner) async {
        invalidated.add(owner);
      },
    );
  });
  test(
    'reads existing APIs with encoded workspace and Mira product filter',
    () async {
      final loaded = await repository.load('workspace/a');
      expect(loaded.soul.name, 'Nova');
      expect(loaded.memoryEnabled, isFalse);
      expect(loaded.memories.single.text, 'Synthetic preference');
      expect(api.paths, [
        '/api/v1/mira/soul',
        '/api/v1/workspaces/workspace%2Fa/ai/memory/settings?product=mira',
        '/api/v1/workspaces/workspace%2Fa/ai/memory/items?product=mira',
      ]);
    },
  );
  test(
    'memory denial retains personality without inventing a consent value',
    () async {
      api.denied = true;
      final loaded = await repository.load('workspace');
      expect(loaded.soul.name, 'Nova');
      expect(loaded.memoryEnabled, isNull);
      expect(loaded.memories, isEmpty);
    },
  );
  test(
    'malformed consent remains unknown and cannot be reported saved',
    () async {
      api.malformed = true;
      expect((await repository.load('workspace')).memoryEnabled, isNull);
      await expectLater(
        repository.setMemoryEnabled(
          'workspace',
          enabled: false,
          products: const {},
        ),
        throwsStateError,
      );
    },
  );
  test(
    'writes personality fields and invalidates captured actor cache',
    () async {
      final saved = await repository.saveSoul(
        const AssistantSoul(
          name: 'Nova',
          tone: 'warm',
          chatTone: 'concise',
          personality: 'Synthetic style',
          boundaries: 'Synthetic limit',
        ),
      );
      expect(saved.name, 'Nova');
      expect(saved.personality, 'Synthetic style');
      expect(api.writes.single, {
        'name': 'Nova',
        'tone': 'warm',
        'chat_tone': 'concise',
        'personality': 'Synthetic style',
        'boundaries': 'Synthetic limit',
      });
      expect(invalidated, ['actor-a']);
    },
  );
  test(
    'missing personality receipt cannot replace the name with a default',
    () async {
      api.malformed = true;
      await expectLater(
        repository.saveSoul(const AssistantSoul(name: 'Nova')),
        throwsStateError,
      );
      expect(invalidated, isEmpty);
    },
  );
  test('collection toggle carries existing product overrides', () async {
    await repository.setMemoryEnabled(
      'workspace',
      enabled: false,
      products: const {'mira': false, 'ai_chat': true},
    );
    expect(api.writes.single, {
      'enabled': false,
      'products': {'mira': false, 'ai_chat': true},
    });
  });
  test('unconfirmed deletion throws and scopes the encoded identity', () async {
    api.deleted = false;
    await expectLater(
      repository.deleteMemory('workspace/a', 'memory/a'),
      throwsStateError,
    );
    expect(
      api.paths.single,
      '/api/v1/workspaces/workspace%2Fa/ai/memory/items/memory%2Fa?product=mira',
    );
  });
}
