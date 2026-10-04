import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Repository extends Mock implements ProfileRepository {}

supa.User _user(String id) => supa.User(
  id: id,
  appMetadata: const {},
  userMetadata: {'display_name': id},
  aud: 'authenticated',
  createdAt: '2026-01-01T00:00:00Z',
);

void main() {
  setUpAll(() => registerFallbackValue(const UserProfile(id: 'fallback')));

  late _Repository repository;
  late ShellProfileCubit cubit;
  setUp(() {
    repository = _Repository();
    cubit = ShellProfileCubit(profileRepository: repository);
    when(
      repository.getCachedProfile,
    ).thenAnswer((_) async => (profile: null, fetchedAt: null));
    when(() => repository.saveCachedProfile(any())).thenAnswer((_) async {});
    when(repository.clearCachedProfile).thenAnswer((_) async {});
    when(repository.dispose).thenReturn(null);
  });
  tearDown(() => cubit.close());

  test('late cached account cannot emit or start a network read', () async {
    final cached = Completer<({UserProfile? profile, DateTime? fetchedAt})>();
    when(repository.getCachedProfile).thenAnswer((_) => cached.future);
    final loading = cubit.loadFromAuthenticatedUser(_user('old'));
    cubit.primeFromAuthenticatedUser(_user('new'));
    cached.complete((profile: const UserProfile(id: 'old'), fetchedAt: null));
    await loading;
    expect(cubit.state.userId, 'new');
    expect(cubit.state.profile?.id, 'new');
    verifyNever(repository.getProfile);
    verifyNever(() => repository.saveCachedProfile(any()));
  });

  test('logout rejects a late network profile and cache write', () async {
    final network = Completer<({UserProfile? profile, String? error})>();
    when(repository.getProfile).thenAnswer((_) => network.future);
    final loading = cubit.loadFromAuthenticatedUser(_user('old'));
    await Future<void>.delayed(Duration.zero);
    await cubit.clear();
    network.complete((profile: const UserProfile(id: 'old'), error: null));
    await loading;
    expect(cubit.state.userId, isNull);
    expect(cubit.state.profile, isNull);
    verifyNever(() => repository.saveCachedProfile(any()));
  });

  test('new external profile supersedes an old same-account read', () async {
    final network = Completer<({UserProfile? profile, String? error})>();
    when(repository.getProfile).thenAnswer((_) => network.future);
    final loading = cubit.loadFromAuthenticatedUser(_user('same'));
    await Future<void>.delayed(Duration.zero);
    const fresh = UserProfile(id: 'same', displayName: 'Fresh');
    await cubit.applyExternalProfile(fresh);
    network.complete((
      profile: const UserProfile(id: 'same', displayName: 'Stale'),
      error: null,
    ));
    await loading;
    expect(cubit.state.profile?.displayName, 'Fresh');
    verify(() => repository.saveCachedProfile(fresh)).called(1);
    verifyNever(
      () => repository.saveCachedProfile(
        const UserProfile(id: 'same', displayName: 'Stale'),
      ),
    );
  });

  test('cache clear waits for an already-started write', () async {
    final saving = Completer<void>();
    final order = <String>[];
    when(() => repository.saveCachedProfile(any())).thenAnswer((_) async {
      order.add('save-start');
      await saving.future;
      order.add('save-end');
    });
    when(repository.clearCachedProfile).thenAnswer((_) async {
      order.add('clear');
    });
    cubit.primeFromAuthenticatedUser(_user('same'));
    final updating = cubit.applyExternalProfile(
      const UserProfile(id: 'same', displayName: 'Update'),
    );
    await Future<void>.delayed(Duration.zero);
    final clearing = cubit.clear();
    expect(cubit.state.userId, isNull);
    expect(order, ['save-start']);
    saving.complete();
    await Future.wait([updating, clearing]);
    expect(order, ['save-start', 'save-end', 'clear']);
    expect(cubit.state.profile, isNull);
  });

  test('external old actor and completion after close are ignored', () async {
    final network = Completer<({UserProfile? profile, String? error})>();
    when(repository.getProfile).thenAnswer((_) => network.future);
    final loading = cubit.loadFromAuthenticatedUser(_user('new'));
    await Future<void>.delayed(Duration.zero);
    await cubit.applyExternalProfile(const UserProfile(id: 'old'));
    verifyNever(() => repository.saveCachedProfile(any()));
    await cubit.close();
    network.complete((profile: const UserProfile(id: 'new'), error: null));
    await loading;
    expect(cubit.state.userId, 'new');
    verifyNever(() => repository.saveCachedProfile(any()));
  });
}
