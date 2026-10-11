import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:mobile/features/profile/view/profile_avatar_removal.dart';
import 'package:mobile/features/profile/view/profile_media_recovery.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

AuthState _user(String id) => AuthState.authenticated(
  supa.User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '',
  ),
);

class _Auth extends Cubit<AuthState> implements AuthCubit {
  _Auth() : super(_user('actor-a'));
  void change(AuthState state) => emit(state);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Repository extends ProfileRepository {
  _Repository(this.auth);
  final _Auth auth;
  int removals = 0;
  bool fail = false;
  bool removed = false;
  UserProfile? persisted;
  @override
  String? getCurrentUserIdSync() => auth.state.user?.id;
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async => (
    profile: UserProfile(
      id: getCurrentUserIdSync()!,
      avatarUrl: removed ? null : 'https://example.test/avatar.webp',
    ),
    error: null,
  );
  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: persisted, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async =>
      persisted = profile;
  @override
  Future<ProfileMediaResult> removeAvatarResult() async {
    removals++;
    if (fail) {
      return ProfileMediaResult.failure(
        const ApiException(message: 'synthetic-private-url', statusCode: 403),
      );
    }
    removed = true;
    return const ProfileMediaResult.success();
  }
}

Future<(_Auth, _Repository, ProfileCubit)> _pump(WidgetTester tester) async {
  ProfileCubit.clearMemoryCache();
  final auth = _Auth();
  final repository = _Repository(auth);
  final cubit = ProfileCubit(profileRepository: repository);
  addTearDown(cubit.close);
  addTearDown(auth.close);
  await cubit.loadProfile();
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<ProfileCubit>.value(value: cubit),
      ],
      child: Builder(
        builder: (ownerContext) => Scaffold(
          body: Column(
            children: [
              shad.OutlineButton(
                onPressed: () =>
                    unawaited(confirmRemoveProfileAvatar(ownerContext)),
                child: const Text('Open removal'),
              ),
              BlocBuilder<ProfileCubit, ProfileState>(
                builder: (context, state) => ProfileMediaRecovery(
                  state: state,
                  avatarPicker: const ProfileAvatarPicker(),
                  pickerContext: ownerContext,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (auth, repository, cubit);
}

void main() {
  for (final departure in ['switch', 'logout', 'ABA']) {
    testWidgets('confirmation rejects $departure after sheet opens', (
      tester,
    ) async {
      final (auth, repository, _) = await _pump(tester);
      await tester.tap(find.text('Open removal'));
      await tester.pumpAndSettle();
      auth.change(
        departure == 'logout'
            ? const AuthState.unauthenticated()
            : _user('actor-b'),
      );
      await tester.pump();
      if (departure == 'ABA') {
        auth.change(_user('actor-a'));
        await tester.pump();
      }
      await tester.tap(
        find.widgetWithText(shad.DestructiveButton, 'Remove avatar'),
      );
      await tester.pumpAndSettle();
      expect(repository.removals, 0);
      expect(find.text('Avatar removed successfully'), findsNothing);
    });
  }
  testWidgets('confirmed removal reloads and persists the cleared avatar', (
    tester,
  ) async {
    final (_, repository, cubit) = await _pump(tester);
    await tester.tap(find.text('Open removal'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(shad.DestructiveButton, 'Remove avatar'),
    );
    await tester.pumpAndSettle();
    expect(repository.removals, 1);
    expect(cubit.state.profile?.avatarUrl, isNull);
    expect(repository.persisted?.avatarUrl, isNull);
    expect(cubit.state.isLoading, isFalse);
    await tester.drainShadToastTimers();
  });
  for (final locale in ['en', 'vi']) {
    testWidgets('$locale denied removal offers the correct safe retry', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = [Locale(locale)];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      final (_, repository, cubit) = await _pump(tester);
      repository.fail = true;
      expect(await cubit.removeAvatar(), isFalse);
      await tester.pumpAndSettle();
      expect(
        cubit.state.mediaFailure?.kind,
        ProfileMediaFailureKind.authorization,
      );
      expect(cubit.state.mediaTarget, ProfileMediaTarget.removeAvatar);
      expect(find.textContaining('synthetic-private'), findsNothing);
      repository.fail = false;
      await tester.tap(
        find.widgetWithText(
          shad.OutlineButton,
          locale == 'en' ? 'Remove avatar' : 'Xóa ảnh đại diện',
        ),
      );
      await tester.pumpAndSettle();
      expect(repository.removals, 2);
      expect(repository.persisted?.avatarUrl, isNull);
      expect(cubit.state.mediaFailure, isNull);
      expect(cubit.state.isLoading, isFalse);
    });
  }
}
