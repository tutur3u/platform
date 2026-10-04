import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockProfileRepository extends Mock implements ProfileRepository {}

void main() {
  group('ProfileCubit', () {
    late _MockProfileRepository profileRepository;

    setUpAll(() {
      registerFallbackValue(const UserProfile(id: 'fallback-user'));
    });

    setUp(() {
      profileRepository = _MockProfileRepository();
      ProfileCubit.clearMemoryCache();
      when(() => profileRepository.dispose()).thenReturn(null);
    });

    test(
      'rejects a previous actor response before memory or disk caching',
      () async {
        var actor = 'first';
        final response = Completer<({UserProfile? profile, String? error})>();
        when(
          () => profileRepository.getCurrentUserIdSync(),
        ).thenAnswer((_) => actor);
        when(
          () => profileRepository.getCachedProfile(),
        ).thenAnswer((_) async => (profile: null, fetchedAt: null));
        when(
          () => profileRepository.getProfile(),
        ).thenAnswer((_) => response.future);
        final cubit = ProfileCubit(profileRepository: profileRepository);
        final pending = cubit.loadProfile();
        await Future<void>.delayed(Duration.zero);
        actor = 'second';
        response.complete((
          profile: const UserProfile(
            id: 'first',
            bannerUrl: 'https://example.test/banner',
          ),
          error: null,
        ));
        await pending;
        expect(cubit.state.profile, isNull);
        verifyNever(() => profileRepository.saveCachedProfile(any()));
        await cubit.close();
      },
    );

    for (final duringReload in [false, true]) {
      test(
        'actor switch releases only owned busy state reload=$duringReload',
        () async {
          var actor = 'first';
          final update = Completer<({bool success, String? error})>();
          final profile = Completer<({UserProfile? profile, String? error})>();
          when(
            () => profileRepository.getCurrentUserIdSync(),
          ).thenAnswer((_) => actor);
          when(
            () => profileRepository.updateDisplayName('name'),
          ).thenAnswer((_) => update.future);
          when(
            () => profileRepository.getCachedProfile(),
          ).thenAnswer((_) async => (profile: null, fetchedAt: null));
          when(
            () => profileRepository.getProfile(),
          ).thenAnswer((_) => profile.future);
          final cubit = ProfileCubit(profileRepository: profileRepository);
          final pending = cubit.updateDisplayName('name');
          expect(cubit.state.isLoading, isTrue);
          if (duringReload) {
            update.complete((success: true, error: null));
            await Future<void>.delayed(Duration.zero);
          }
          actor = 'second';
          if (duringReload) {
            profile.complete((profile: null, error: 'Unavailable'));
          } else {
            update.complete((success: false, error: 'Old actor failure'));
          }
          expect(await pending, isFalse);
          expect(cubit.state.isLoading, isFalse);
          expect(cubit.state.error, isNull);
          await cubit.close();
        },
      );
    }

    test('old completion cannot release the next actor update', () async {
      var actor = 'first';
      final first = Completer<({bool success, String? error})>();
      final second = Completer<({bool success, String? error})>();
      when(
        () => profileRepository.getCurrentUserIdSync(),
      ).thenAnswer((_) => actor);
      when(
        () => profileRepository.updateDisplayName('first'),
      ).thenAnswer((_) => first.future);
      when(
        () => profileRepository.updateDisplayName('second'),
      ).thenAnswer((_) => second.future);
      final refreshed = Completer<({UserProfile? profile, String? error})>();
      when(
        () => profileRepository.getCachedProfile(),
      ).thenAnswer((_) async => (profile: null, fetchedAt: null));
      when(
        () => profileRepository.getProfile(),
      ).thenAnswer((_) => refreshed.future);
      final cubit = ProfileCubit(profileRepository: profileRepository);
      final old = cubit.updateDisplayName('first');
      actor = 'second';
      final current = cubit.updateDisplayName('second');
      final load = cubit.loadProfile();
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.isLoading, isTrue);
      first.complete((success: false, error: 'Old failure'));
      expect(await old, isFalse);
      expect(cubit.state.isLoading, isTrue);
      expect(cubit.state.error, isNull);
      refreshed.complete((profile: null, error: 'Unavailable'));
      await load;
      expect(cubit.state.isLoading, isTrue);
      second.complete((success: false, error: 'Current failure'));
      expect(await current, isFalse);
      expect(cubit.state.isLoading, isFalse);
      expect(cubit.state.error, 'Current failure');
      await cubit.close();
    });

    blocTest<ProfileCubit, ProfileState>(
      'ignores cached profile data from a different authenticated user',
      build: () {
        when(
          () => profileRepository.getCurrentUserIdSync(),
        ).thenReturn('user-2');
        when(() => profileRepository.getCachedProfile()).thenAnswer(
          (_) async => (
            profile: const UserProfile(
              id: 'user-1',
              displayName: 'Old User',
              email: 'old@example.com',
            ),
            fetchedAt: DateTime(2026, 4, 17, 12),
          ),
        );
        when(() => profileRepository.getProfile()).thenAnswer(
          (_) async => (
            profile: const UserProfile(
              id: 'user-2',
              displayName: 'New User',
              email: 'new@example.com',
            ),
            error: null,
          ),
        );
        when(
          () => profileRepository.saveCachedProfile(any()),
        ).thenAnswer((_) async {});
        return ProfileCubit(profileRepository: profileRepository);
      },
      act: (cubit) => cubit.loadProfile(),
      expect: () => [
        const ProfileState(status: ProfileStatus.loading),
        isA<ProfileState>()
            .having((state) => state.status, 'status', ProfileStatus.loaded)
            .having((state) => state.profile?.id, 'profile id', 'user-2')
            .having(
              (state) => state.profile?.displayName,
              'display name',
              'New User',
            )
            .having((state) => state.isFromCache, 'is from cache', false),
      ],
    );

    blocTest<ProfileCubit, ProfileState>(
      'reuses cached profile data when it matches current user',
      build: () {
        const cachedProfile = UserProfile(
          id: 'user-1',
          displayName: 'User 1',
          email: 'user1@example.com',
        );
        when(
          () => profileRepository.getCurrentUserIdSync(),
        ).thenReturn('user-1');
        when(() => profileRepository.getCachedProfile()).thenAnswer(
          (_) async =>
              (profile: cachedProfile, fetchedAt: DateTime(2026, 4, 17, 12)),
        );
        when(
          () => profileRepository.getProfile(),
        ).thenAnswer((_) async => (profile: cachedProfile, error: null));
        when(
          () => profileRepository.saveCachedProfile(any()),
        ).thenAnswer((_) async {});
        return ProfileCubit(profileRepository: profileRepository);
      },
      act: (cubit) => cubit.loadProfile(),
      expect: () => [
        isA<ProfileState>()
            .having((state) => state.status, 'status', ProfileStatus.loaded)
            .having((state) => state.profile?.id, 'profile id', 'user-1')
            .having((state) => state.isFromCache, 'is from cache', true)
            .having((state) => state.isRefreshing, 'is refreshing', false),
        isA<ProfileState>()
            .having((state) => state.status, 'status', ProfileStatus.loaded)
            .having((state) => state.profile?.id, 'profile id', 'user-1')
            .having((state) => state.isFromCache, 'is from cache', true)
            .having((state) => state.isRefreshing, 'is refreshing', true),
        isA<ProfileState>()
            .having((state) => state.status, 'status', ProfileStatus.loaded)
            .having((state) => state.profile?.id, 'profile id', 'user-1')
            .having((state) => state.isFromCache, 'is from cache', false)
            .having((state) => state.isRefreshing, 'is refreshing', false),
      ],
    );
  });
}
