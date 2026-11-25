import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/command_palette/palette_cubit.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/command_palette/palette_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SearchRepository implements PaletteRepository {
  final requests = <String, Completer<PaletteSearchResult>>{};

  @override
  Future<PaletteSearchResult> search(String query) =>
      (requests[query] = Completer<PaletteSearchResult>()).future;
}

PaletteSearchResult _result(String title) => (
  records: [
    (
      id: title,
      title: title,
      searchableBody: '',
      route: '/notes',
      kind: PaletteRecordKind.note,
    ),
  ],
  failed: false,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('debounces typing and drops an older in-flight reply', (
    tester,
  ) async {
    final repository = _SearchRepository();
    final cubit = PaletteCubit(
      repository: repository,
      recents: const DevicePaletteRecents('actor'),
    );
    addTearDown(cubit.close);

    cubit.setQuery('r');
    await tester.pump(const Duration(milliseconds: 200));
    cubit.setQuery('report');
    await tester.pump(const Duration(milliseconds: 299));
    expect(repository.requests, isEmpty);
    expect(cubit.state.status, PaletteSearchStatus.loading);
    await tester.pump(const Duration(milliseconds: 1));
    expect(repository.requests.keys, ['report']);

    cubit.setQuery('plan');
    await tester.pump(const Duration(milliseconds: 300));
    repository.requests['plan']!.complete(_result('Plan'));
    await tester.pump();
    expect(cubit.state.results.single.title, 'Plan');

    repository.requests['report']!.complete(_result('Report'));
    await tester.pump();
    expect(cubit.state.query, 'plan');
    expect(cubit.state.results.single.title, 'Plan');
  });

  testWidgets('clearing the query invalidates a pending response', (
    tester,
  ) async {
    final repository = _SearchRepository();
    final cubit = PaletteCubit(
      repository: repository,
      recents: const DevicePaletteRecents('actor'),
    );
    addTearDown(cubit.close);

    cubit.setQuery('report');
    await tester.pump(const Duration(milliseconds: 300));
    cubit.setQuery('');
    repository.requests['report']!.complete(_result('Report'));
    await tester.pump();
    expect(cubit.state.status, PaletteSearchStatus.idle);
    expect(cubit.state.results, isEmpty);
  });

  test('stores eight unique command IDs per account', () async {
    const recents = DevicePaletteRecents('first-actor');
    for (var i = 0; i < 10; i++) {
      await recents.remember('command-$i');
    }
    await recents.remember('command-5');
    expect(
      await recents.read(),
      [
        'command-5',
        'command-9',
        'command-8',
        'command-7',
        'command-6',
        'command-4',
        'command-3',
        'command-2',
      ],
    );
    const otherAccount = DevicePaletteRecents('other-actor');
    expect(await otherAccount.read(), isEmpty);
  });
}
