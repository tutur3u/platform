import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockProfileRepository extends Mock implements ProfileRepository {}

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

supa.User _user({
  required String id,
  required String email,
  required String displayName,
}) => supa.User.fromJson({
  'id': id,
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': email,
  'app_metadata': const <String, dynamic>{},
  'user_metadata': <String, dynamic>{'display_name': displayName},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

void main() {
  group('ProfilePage', () {
    late _MockProfileRepository profileRepository;
    late _MockAuthCubit authCubit;
    late StreamController<AuthState> authStateController;
    late String currentUserId;

    const user1Profile = UserProfile(
      id: 'user-1',
      email: 'user1@example.com',
      displayName: 'User 1',
    );
    const user2Profile = UserProfile(
      id: 'user-2',
      email: 'user2@example.com',
      displayName: 'User 2',
    );

    setUpAll(() {
      registerFallbackValue(const UserProfile(id: 'fallback-user'));
    });

    setUp(() {
      profileRepository = _MockProfileRepository();
      authCubit = _MockAuthCubit();
      authStateController = StreamController<AuthState>();
      currentUserId = 'user-1';
      ProfileCubit.clearMemoryCache();

      final initialAuthState = AuthState.authenticated(
        _user(id: 'user-1', email: 'user1@example.com', displayName: 'User 1'),
      );
      when(() => authCubit.state).thenReturn(initialAuthState);
      whenListen(
        authCubit,
        authStateController.stream,
        initialState: initialAuthState,
      );

      when(
        () => profileRepository.getCurrentUserIdSync(),
      ).thenAnswer((_) => currentUserId);
      when(() => profileRepository.getCachedProfile()).thenAnswer((_) async {
        return switch (currentUserId) {
          'user-1' => (
            profile: user1Profile,
            fetchedAt: DateTime.now(),
          ),
          'user-2' => (profile: null, fetchedAt: null),
          _ => (profile: null, fetchedAt: null),
        };
      });
      when(() => profileRepository.getProfile()).thenAnswer((_) async {
        return switch (currentUserId) {
          'user-1' => (profile: user1Profile, error: null),
          'user-2' => (profile: user2Profile, error: null),
          _ => (profile: null, error: 'missing user'),
        };
      });
      when(
        () => profileRepository.saveCachedProfile(any()),
      ).thenAnswer((_) async {});
      when(
        () => profileRepository.clearCachedProfile(),
      ).thenAnswer((_) async {});
      when(() => profileRepository.dispose()).thenReturn(null);
    });

    tearDown(() async {
      await authStateController.close();
    });

    testWidgets('reloads profile when auth user changes in place', (
      tester,
    ) async {
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider(
              create: (_) => ShellProfileCubit(
                profileRepository: profileRepository,
              ),
            ),
          ],
          child: ProfilePage(profileRepository: profileRepository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('User 1'), findsWidgets);

      currentUserId = 'user-2';
      authStateController.add(
        AuthState.authenticated(
          _user(
            id: 'user-2',
            email: 'user2@example.com',
            displayName: 'User 2',
          ),
        ),
      );

      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('User 2'), findsWidgets);
      expect(find.text('user2@example.com'), findsWidgets);
      expect(find.text('User 1'), findsNothing);
      expect(find.text('user1@example.com'), findsNothing);
    });
  });
}
