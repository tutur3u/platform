import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';

void main() {
  group('WorkspaceStorageBackendState', () {
    test('parses a full payload including overview counters', () {
      final state = WorkspaceStorageBackendState.fromJson({
        'provider': 'r2',
        'available': true,
        'selected': true,
        'misconfigured': false,
        'message': 'ready',
        'overview': {'totalSize': 2048, 'fileCount': 3},
      });

      expect(state.provider, workspaceStorageProviderR2);
      expect(state.available, isTrue);
      expect(state.selected, isTrue);
      expect(state.misconfigured, isFalse);
      expect(state.message, 'ready');
      expect(state.totalSize, 2048);
      expect(state.fileCount, 3);
    });

    test('defaults provider and flags for an empty payload', () {
      final state = WorkspaceStorageBackendState.fromJson(const {});

      expect(state.provider, workspaceStorageProviderSupabase);
      expect(state.available, isFalse);
      expect(state.selected, isFalse);
      expect(state.misconfigured, isFalse);
      expect(state.message, isNull);
      expect(state.totalSize, isNull);
      expect(state.fileCount, isNull);
    });

    test('treats blank strings as missing and only true as true', () {
      final state = WorkspaceStorageBackendState.fromJson({
        'provider': '   ',
        'message': '',
        'available': 'true',
        'selected': 1,
      });

      expect(state.provider, workspaceStorageProviderSupabase);
      expect(state.message, isNull);
      expect(state.available, isFalse);
      expect(state.selected, isFalse);
    });

    test('coerces overview numbers from num and numeric strings', () {
      final state = WorkspaceStorageBackendState.fromJson({
        'overview': {'totalSize': 12.9, 'fileCount': '7'},
      });

      expect(state.totalSize, 12);
      expect(state.fileCount, 7);
    });

    test('ignores non-numeric overview values and non-map overviews', () {
      final junk = WorkspaceStorageBackendState.fromJson({
        'overview': {'totalSize': 'abc', 'fileCount': true},
      });
      expect(junk.totalSize, isNull);
      expect(junk.fileCount, isNull);

      final notMap = WorkspaceStorageBackendState.fromJson({
        'overview': 'nope',
      });
      expect(notMap.totalSize, isNull);
      expect(notMap.fileCount, isNull);
    });

    test('accepts a loosely typed overview map', () {
      final state = WorkspaceStorageBackendState.fromJson({
        'overview': <Object?, Object?>{'totalSize': 5, 'fileCount': 1},
      });

      expect(state.totalSize, 5);
      expect(state.fileCount, 1);
    });

    test('toJson round-trips through fromJson', () {
      const original = WorkspaceStorageBackendState(
        provider: 'r2',
        available: true,
        selected: false,
        misconfigured: true,
        message: 'bad bucket',
        totalSize: 10,
        fileCount: 2,
      );

      final json = original.toJson();
      expect(json['overview'], {'totalSize': 10, 'fileCount': 2});

      final copy = WorkspaceStorageBackendState.fromJson(json);
      expect(copy.toJson(), json);
    });
  });

  group('WorkspaceStorageAutoExtractState', () {
    test('parses flags and defaults the rest to false', () {
      final state = WorkspaceStorageAutoExtractState.fromJson({
        'enabled': true,
        'proxyTokenConfigured': true,
      });

      expect(state.enabled, isTrue);
      expect(state.configured, isFalse);
      expect(state.proxyUrlConfigured, isFalse);
      expect(state.proxyTokenConfigured, isTrue);
    });

    test('toJson round-trips through fromJson', () {
      const original = WorkspaceStorageAutoExtractState(
        enabled: true,
        configured: true,
        proxyUrlConfigured: false,
        proxyTokenConfigured: true,
      );

      expect(
        WorkspaceStorageAutoExtractState.fromJson(original.toJson()).toJson(),
        original.toJson(),
      );
    });
  });

  group('WorkspaceStorageRolloutState', () {
    final payload = <String, dynamic>{
      'activeProvider': 'r2',
      'activeProviderMisconfigured': true,
      'backends': {
        'supabase': {'provider': 'supabase', 'available': true},
        'r2': {
          'provider': 'r2',
          'available': true,
          'selected': true,
          'overview': {'totalSize': 99, 'fileCount': 4},
        },
      },
      'autoExtract': {'enabled': true, 'configured': true},
    };

    test('parses backends keyed by provider and the auto-extract state', () {
      final state = WorkspaceStorageRolloutState.fromJson(payload);

      expect(state.activeProvider, 'r2');
      expect(state.activeProviderMisconfigured, isTrue);
      expect(state.backends.keys, unorderedEquals(['supabase', 'r2']));
      expect(state.backend('r2')?.fileCount, 4);
      expect(state.backend('supabase')?.available, isTrue);
      expect(state.backend('missing'), isNull);
      expect(state.autoExtract.enabled, isTrue);
      expect(state.autoExtract.proxyUrlConfigured, isFalse);
    });

    test('falls back to safe defaults for an empty payload', () {
      final state = WorkspaceStorageRolloutState.fromJson(const {});

      expect(state.activeProvider, workspaceStorageProviderSupabase);
      expect(state.activeProviderMisconfigured, isFalse);
      expect(state.backends, isEmpty);
      expect(state.autoExtract.enabled, isFalse);
    });

    test('tolerates non-map backend entries', () {
      final state = WorkspaceStorageRolloutState.fromJson({
        'backends': {'r2': 'broken'},
        'autoExtract': 'broken',
      });

      expect(state.backend('r2')?.provider, workspaceStorageProviderSupabase);
      expect(state.backend('r2')?.available, isFalse);
      expect(state.autoExtract.configured, isFalse);
    });

    test('toJson round-trips through fromJson', () {
      final state = WorkspaceStorageRolloutState.fromJson(payload);
      final json = state.toJson();

      expect(WorkspaceStorageRolloutState.fromJson(json).toJson(), json);
      expect(
        (json['backends'] as Map).keys,
        unorderedEquals(['supabase', 'r2']),
      );
    });
  });

  group('WorkspaceStorageMigrationResult', () {
    test('parses counters from numbers and strings', () {
      final result = WorkspaceStorageMigrationResult.fromJson({
        'sourceProvider': 'supabase',
        'targetProvider': 'r2',
        'filesCopied': 12,
        'foldersPrepared': '3',
        'skipped': 1.0,
      });

      expect(result.sourceProvider, 'supabase');
      expect(result.targetProvider, 'r2');
      expect(result.filesCopied, 12);
      expect(result.foldersPrepared, 3);
      expect(result.skipped, 1);
    });

    test('defaults providers to supabase and counters to zero', () {
      final result = WorkspaceStorageMigrationResult.fromJson(const {});

      expect(result.sourceProvider, workspaceStorageProviderSupabase);
      expect(result.targetProvider, workspaceStorageProviderSupabase);
      expect(result.filesCopied, 0);
      expect(result.foldersPrepared, 0);
      expect(result.skipped, 0);
    });
  });
}
