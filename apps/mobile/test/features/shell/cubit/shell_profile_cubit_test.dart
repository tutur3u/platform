import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _MockProfileRepository extends Mock implements ProfileRepository {}

supa.User _userWithAvatar(String avatarUrl) => supa.User.fromJson({
  'id': 'user-1',
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': 'casey@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': <String, dynamic>{
    'avatar_url': avatarUrl,
    'display_name': 'Casey',
  },
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

void main() {
  setUpAll(() {
    registerFallbackValue(const UserProfile(id: 'fallback-user'));
  });

  group('ShellProfileCubit', () {
    late _MockProfileRepository profileRepository;
    late ShellProfileCubit cubit;

    setUp(() {
      profileRepository = _MockProfileRepository();
      cubit = ShellProfileCubit(profileRepository: profileRepository);
      when(
        () => profileRepository.saveCachedProfile(any()),
      ).thenAnswer((_) async {});
      when(
        () => profileRepository.clearCachedProfile(),
      ).thenAnswer((_) async {});
      when(() => profileRepository.dispose()).thenReturn(null);
    });

    tearDown(() async {
      await cubit.close();
    });

    test(
      'keeps the current avatar url when only signed query params change',
      () async {
        final user = _userWithAvatar(
          'https://cdn.example.com/avatar.png?token=one',
        );

        when(
          () => profileRepository.getCachedProfile(),
        ).thenAnswer((_) async => (profile: null, fetchedAt: null));
        when(
          () => profileRepository.getProfile(),
        ).thenAnswer(
          (_) async => (
            profile: const UserProfile(
              id: 'user-1',
              displayName: 'Casey',
              avatarUrl: 'https://cdn.example.com/avatar.png?token=two',
            ),
            error: null,
          ),
        );

        cubit.primeFromAuthenticatedUser(user);
        await cubit.loadFromAuthenticatedUser(user, forceRefresh: true);

        expect(
          cubit.state.avatarUrl,
          'https://cdn.example.com/avatar.png?token=one',
        );
        expect(
          cubit.state.avatarIdentityKey,
          'https://cdn.example.com/avatar.png',
        );
      },
    );

    test(
      'updates the rendered avatar when the underlying avatar path changes',
      () async {
        final user = _userWithAvatar(
          'https://cdn.example.com/avatar-a.png?token=one',
        );

        when(
          () => profileRepository.getCachedProfile(),
        ).thenAnswer((_) async => (profile: null, fetchedAt: null));
        when(
          () => profileRepository.getProfile(),
        ).thenAnswer(
          (_) async => (
            profile: const UserProfile(
              id: 'user-1',
              displayName: 'Casey',
              avatarUrl: 'https://cdn.example.com/avatar-b.png?token=two',
            ),
            error: null,
          ),
        );

        cubit.primeFromAuthenticatedUser(user);
        await cubit.loadFromAuthenticatedUser(user, forceRefresh: true);

        expect(
          cubit.state.avatarUrl,
          'https://cdn.example.com/avatar-b.png?token=two',
        );
        expect(
          cubit.state.avatarIdentityKey,
          'https://cdn.example.com/avatar-b.png',
        );
      },
    );

    test(
      'fetches profile from API when the signed-in user id changes',
      () async {
        final userA = _userWithAvatar(
          'https://cdn.example.com/avatar.png?token=one',
        );
        final userB = supa.User.fromJson({
          'id': 'user-2',
          'aud': 'authenticated',
          'role': 'authenticated',
          'email': 'bob@example.com',
          'app_metadata': const <String, dynamic>{},
          'user_metadata': const <String, dynamic>{},
          'created_at': '2024-01-01T00:00:00.000000Z',
        })!;

        var getProfileCalls = 0;
        when(
          () => profileRepository.getCachedProfile(),
        ).thenAnswer((_) async => (profile: null, fetchedAt: null));
        when(
          () => profileRepository.getProfile(),
        ).thenAnswer((_) async {
          getProfileCalls++;
          if (getProfileCalls == 1) {
            return (
              profile: const UserProfile(
                id: 'user-1',
                displayName: 'Casey',
                avatarUrl: 'https://cdn.example.com/avatar.png',
              ),
              error: null,
            );
          }
          return (
            profile: const UserProfile(
              id: 'user-2',
              displayName: 'Bob',
              avatarUrl: 'https://cdn.example.com/bob.png',
            ),
            error: null,
          );
        });

        await cubit.loadFromAuthenticatedUser(userA, forceRefresh: true);
        expect(getProfileCalls, 1);

        await cubit.loadFromAuthenticatedUser(userB);

        expect(getProfileCalls, 2);
        expect(cubit.state.userId, 'user-2');
        expect(cubit.state.profile?.displayName, 'Bob');
        expect(
          cubit.state.profile?.avatarUrl,
          'https://cdn.example.com/bob.png',
        );
      },
    );
  });

  group('avatarIdentityKeyForUrl', () {
    test('ignores transient query params', () {
      expect(
        avatarIdentityKeyForUrl(
          'https://cdn.example.com/avatar.png?token=abc&expires=123',
        ),
        'https://cdn.example.com/avatar.png',
      );
    });
  });
}
