import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/data/workspace_recents_store.dart';
import 'package:mobile/features/workspace/data/workspace_visibility_repository.dart';
import 'package:mobile/features/workspace/workspace_picker_order.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Workspaces extends Mock implements WorkspaceRepository {}

class _Visibility extends Mock implements WorkspaceVisibilityRepository {}

class _Recents extends WorkspaceRecentsStore {
  _Recents(this.stored);

  final Map<String, List<String>> stored;

  @override
  Future<List<String>> read(String actorId) async =>
      stored[actorId] ?? const [];

  @override
  Future<void> write(String actorId, List<String> ids) async =>
      stored[actorId] = ids;
}

const _personal = Workspace(id: 'personal', name: 'Personal', personal: true);
const _team = Workspace(id: 'team', name: 'Team');
const _ops = Workspace(id: 'ops', name: 'Ops');

void main() {
  group('pushWorkspaceRecent', () {
    test('moves an id to the front without duplicates', () {
      expect(pushWorkspaceRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
      expect(pushWorkspaceRecent(const [], 'a'), ['a']);
    });

    test('keeps at most the limit', () {
      final ids = [for (var i = 0; i < workspaceRecentsLimit; i++) '$i'];
      final next = pushWorkspaceRecent(ids, 'new');
      expect(next, hasLength(workspaceRecentsLimit));
      expect(next.first, 'new');
      expect(next, isNot(contains('${workspaceRecentsLimit - 1}')));
    });
  });

  group('orderPickerWorkspaces', () {
    const all = [_personal, _team, _ops];

    test('puts the selection first, then recent use, then the rest', () {
      expect(
        orderPickerWorkspaces(all, selectedId: 'team', recentIds: ['ops']),
        [_team, _ops, _personal],
      );
    });

    test('falls back to the given order without recent use', () {
      expect(orderPickerWorkspaces(all, selectedId: 'ops'), [
        _ops,
        _personal,
        _team,
      ]);
    });

    test('ignores recent ids that are not listed', () {
      expect(orderPickerWorkspaces(all, recentIds: ['gone', 'ops']), [
        _ops,
        _personal,
        _team,
      ]);
    });
  });

  test('the store keeps each account separate in preferences', () async {
    SharedPreferences.setMockInitialValues({});
    const store = WorkspaceRecentsStore();
    await store.write('a', ['ws-1']);
    expect(await store.read('a'), ['ws-1']);
    expect(await store.read('b'), isEmpty);
  });

  test('clear removes one account and clearAll every account', () async {
    SharedPreferences.setMockInitialValues({'other-preference': 'kept'});
    const store = WorkspaceRecentsStore();
    await store.write('a', ['ws-1']);
    await store.write('b', ['ws-2']);
    await store.clear('a');
    expect(await store.read('a'), isEmpty);
    expect(await store.read('b'), ['ws-2']);
    await store.write('a', ['ws-1']);
    await store.clearAll();
    expect(await store.read('a'), isEmpty);
    expect(await store.read('b'), isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('other-preference'), 'kept');
  });

  group('WorkspaceCubit recent use', () {
    late _Workspaces repo;
    late _Visibility visibility;
    late _Recents recents;
    late WorkspaceCubit cubit;

    setUpAll(() => registerFallbackValue(_personal));
    setUp(() {
      repo = _Workspaces();
      visibility = _Visibility();
      recents = _Recents({
        'A': ['ops'],
        'B': ['team'],
      });
      when(() => repo.authenticatedUserId).thenReturn('A');
      when(
        () => repo.getWorkspaces(),
      ).thenAnswer((_) async => [_personal, _team, _ops]);
      when(() => repo.getDefaultWorkspace()).thenAnswer((_) async => null);
      when(() => repo.loadDefaultWorkspaceId()).thenAnswer((_) async => null);
      when(
        () => repo.loadSelectedWorkspace(),
      ).thenAnswer((_) async => _personal);
      when(
        () => repo.getMobileHiddenModuleIds(any()),
      ).thenAnswer((_) async => []);
      when(() => repo.getWorkspaceLimits()).thenThrow(Exception('skip'));
      when(() => repo.saveSelectedWorkspace(any())).thenAnswer((_) async {});
      when(() => repo.saveCachedWorkspaces(any())).thenAnswer((_) async {});
      when(() => visibility.readCached(any())).thenAnswer(
        (_) async =>
            const CacheReadResult<List<String>>(state: CacheEntryState.missing),
      );
      when(() => visibility.refresh(any())).thenAnswer((_) async => []);
      when(() => visibility.saveCached(any(), any())).thenAnswer((_) async {});
      cubit = WorkspaceCubit(
        workspaceRepository: repo,
        visibilityRepository: visibility,
        recentsStore: recents,
      );
    });
    tearDown(() => cubit.close());

    Future<void> settle() async {
      for (var i = 0; i < 5; i++) {
        await Future<void>.delayed(Duration.zero);
      }
    }

    test('loads the signed-in account recent workspaces', () async {
      await cubit.loadWorkspaces(forceRefresh: true);
      await settle();
      expect(cubit.state.recentWorkspaceIds, ['ops']);
    });

    test('a switch moves the workspace first and saves the list', () async {
      await cubit.loadWorkspaces(forceRefresh: true);
      await settle();
      await cubit.selectWorkspace(_team);
      await settle();
      expect(cubit.state.recentWorkspaceIds, ['team', 'ops']);
      expect(recents.stored['A'], ['team', 'ops']);
      expect(recents.stored['B'], ['team']);
    });
  });
}
