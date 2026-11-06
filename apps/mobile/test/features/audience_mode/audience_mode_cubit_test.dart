import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/audience_mode/audience_mode_repository.dart';
import 'package:mobile/features/audience_mode/audience_mode_store.dart';

import 'audience_mode_fakes.dart';

void main() {
  late FakeAudienceModeRepository repository;
  late MemoryAudienceModeStore store;
  late AudienceModeCubit cubit;

  setUp(() {
    repository = FakeAudienceModeRepository();
    store = MemoryAudienceModeStore();
    cubit = AudienceModeCubit(repository: repository, store: store);
  });

  tearDown(() => cubit.close());

  test('an admin default opens the workspace in Education', () async {
    repository.defaults['ec'] = AudienceMode.education;
    await cubit.bind(userId: 'u1', wsId: 'ec');
    expect(cubit.state.status, AudienceModeStatus.ready);
    expect(cubit.state.mode, AudienceMode.education);
    expect(cubit.state.source, AudienceModeSource.workspaceDefault);
    expect(store.values['u1/ec']?.workspaceDefault, AudienceMode.education);
  });

  test('the cached mode renders before the network answers', () async {
    store.values['u1/ec'] = const AudienceModeLayers(
      workspaceDefault: AudienceMode.education,
    );
    repository.gate = Completer<void>();
    final bound = cubit.bind(userId: 'u1', wsId: 'ec');
    expect(cubit.state.status, AudienceModeStatus.ready);
    expect(cubit.state.mode, AudienceMode.education);
    repository.gate!.complete();
    await bound;
    // The server no longer has a default; the revalidated value wins.
    expect(cubit.state.mode, AudienceMode.general);
  });

  test('a failed refresh keeps the last known layers', () async {
    store.values['u1/ec'] = const AudienceModeLayers(
      workspaceDefault: AudienceMode.education,
    );
    repository.fail = true;
    await cubit.bind(userId: 'u1', wsId: 'ec');
    expect(cubit.state.mode, AudienceMode.education);
  });

  test('a late result for a previous workspace is dropped', () async {
    repository.defaults['ec'] = AudienceMode.education;
    repository.gate = Completer<void>();
    final first = cubit.bind(userId: 'u1', wsId: 'ec');
    final second = cubit.bind(userId: 'u1', wsId: 'personal');
    repository.gate!.complete();
    await Future.wait([first, second]);
    expect(cubit.state.wsId, 'personal');
    expect(cubit.state.mode, AudienceMode.general);
  });

  test('signing out clears the mode', () async {
    repository.defaults['ec'] = AudienceMode.education;
    await cubit.bind(userId: 'u1', wsId: 'ec');
    await cubit.bind(userId: null, wsId: 'ec');
    expect(cubit.state, const AudienceModeState());
    expect(cubit.state.mode, AudienceMode.general);
  });

  test('a personal choice applies immediately and is saved', () async {
    repository.defaults['ec'] = AudienceMode.education;
    await cubit.bind(userId: 'u1', wsId: 'ec');
    await cubit.setOverride(AudienceMode.general);
    expect(cubit.state.mode, AudienceMode.general);
    expect(cubit.state.source, AudienceModeSource.override);
    expect(repository.saves, ['override:ec:general']);
    expect(store.values['u1/ec']?.personal, AudienceMode.general);
  });

  test('a rejected write restores the previous layer', () async {
    await cubit.bind(userId: 'u1', wsId: 'ec');
    repository.saveError = const ApiException(
      message: 'Forbidden',
      statusCode: 403,
    );
    await expectLater(
      cubit.setWorkspaceDefault(AudienceMode.education),
      throwsA(isA<ApiException>()),
    );
    expect(cubit.state.layers.workspaceDefault, isNull);
    expect(cubit.state.mode, AudienceMode.general);
  });

  test('a queued personal write survives a refresh', () async {
    repository.overrides['ec'] = AudienceMode.education;
    repository.pending = {
      AudienceModeRepository.overridePath('ec'): AudienceMode.general,
    };
    await cubit.bind(userId: 'u1', wsId: 'ec');
    expect(cubit.state.layers.personal, AudienceMode.general);
  });

  test('a refresh in flight never replaces a newer local choice', () async {
    await cubit.bind(userId: 'u1', wsId: 'ec');
    repository.overrides['ec'] = AudienceMode.education;
    repository.gate = Completer<void>();
    final refresh = cubit.refresh();
    await cubit.setOverride(AudienceMode.general);
    repository.gate!.complete();
    await refresh;
    expect(cubit.state.layers.personal, AudienceMode.general);
  });

  test('onboarding writes the account preference', () async {
    await cubit.bind(userId: 'u1', wsId: 'personal');
    await cubit.setAccountMode(AudienceMode.education);
    expect(cubit.state.mode, AudienceMode.education);
    expect(cubit.state.source, AudienceModeSource.account);
    expect(repository.saves, ['account:education']);
  });
}
