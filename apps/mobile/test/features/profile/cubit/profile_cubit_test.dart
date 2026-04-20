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
          (_) async => (
            profile: cachedProfile,
            fetchedAt: DateTime(2026, 4, 17, 12),
          ),
        );
        when(() => profileRepository.getProfile()).thenAnswer(
          (_) async => (
            profile: cachedProfile,
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
