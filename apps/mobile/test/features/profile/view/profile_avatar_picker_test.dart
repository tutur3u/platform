import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends Cubit<AuthState> implements AuthCubit {
  _Auth() : super(_signedIn('actor-a'));
  void change(AuthState state) => emit(state);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

AuthState _signedIn(String actor) => AuthState.authenticated(
  supa.User(
    id: actor,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '',
  ),
);

class _Repository extends ProfileRepository {
  _Repository(this.currentActor);
  final String? Function() currentActor;
  final writes = <String?>[];
  bool succeeds = true;
  @override
  String? getCurrentUserIdSync() => currentActor();
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async =>
      (profile: UserProfile(id: currentActor()!), error: null);
  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: null, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async {}
  @override
  Future<ProfileMediaResult> saveAvatarResult(File file) async {
    writes.add(currentActor());
    return succeeds
        ? const ProfileMediaResult.success()
        : ProfileMediaResult.failure(Exception('Synthetic failure'));
  }
}

class _Picker extends ProfileAvatarPicker {
  _Picker(this.stage);
  final String stage;
  final entered = Completer<void>();
  final release = Completer<void>();
  final calls = <String>[];
  String? cancelAt;
  Future<T?> _step<T>(String name, T value) async {
    calls.add(name);
    if (stage == name) {
      entered.complete();
      await release.future;
    }
    return cancelAt == name ? null : value;
  }

  @override
  Future<ImageSource?> chooseSource(BuildContext context) =>
      _step('source', ImageSource.gallery);
  @override
  Future<File?> pickImage(ImageSource source) =>
      _step('picker', File('/synthetic/avatar-source.png'));
  @override
  Future<File?> cropImage(BuildContext context, File file) =>
      _step('crop', File('/synthetic/avatar-crop.png'));
}

Future<(_Auth, _Repository, ProfileCubit, StreamController<AuthState>)> _pump(
  WidgetTester tester,
  _Picker picker,
) async {
  ProfileCubit.clearMemoryCache();
  final auth = _Auth();
  final states = StreamController<AuthState>.broadcast();
  final subscription = states.stream.listen(auth.change);
  final repository = _Repository(() => auth.state.user?.id);
  final cubit = ProfileCubit(profileRepository: repository);
  await cubit.loadProfile();
  addTearDown(() async {
    await cubit.close();
    await subscription.cancel();
    await states.close();
    if (!auth.isClosed) await auth.close();
  });
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<ProfileCubit>.value(value: cubit),
      ],
      child: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () =>
                pickAndUploadProfileAvatar(context, picker: picker),
            child: const Text('Choose avatar'),
          ),
        ),
      ),
    ),
  );
  return (auth, repository, cubit, states);
}

void main() {
  for (final stage in ['source', 'picker', 'crop']) {
    for (final change in ['switch', 'logout', 'ABA']) {
      testWidgets('$stage departure $change never publishes avatar intent', (
        tester,
      ) async {
        final picker = _Picker(stage);
        final (_, repository, _, states) = await _pump(tester, picker);
        await tester.tap(find.text('Choose avatar'));
        await tester.pump();
        expect(picker.entered.isCompleted, isTrue);
        states.add(
          change == 'logout'
              ? const AuthState.unauthenticated()
              : _signedIn('actor-b'),
        );
        await tester.pump();
        if (change == 'ABA') {
          states.add(_signedIn('actor-a'));
          await tester.pump();
        }
        picker.release.complete();
        await tester.pumpAndSettle();
        expect(repository.writes, isEmpty);
        expect(picker.calls.last, stage);
        expect(tester.takeException(), isNull);
      });
    }
    testWidgets('$stage chooser cancellation remains side-effect free', (
      tester,
    ) async {
      final picker = _Picker('none')..cancelAt = stage;
      final (_, repository, _, _) = await _pump(tester, picker);
      await tester.tap(find.text('Choose avatar'));
      await tester.pumpAndSettle();
      expect(repository.writes, isEmpty);
      expect(picker.calls.last, stage);
    });
  }
  testWidgets(
    'successful stages write once and a failed upload can be retried',
    (tester) async {
      final picker = _Picker('none');
      final (_, repository, _, _) = await _pump(tester, picker);
      repository.succeeds = false;
      await tester.tap(find.text('Choose avatar'));
      await tester.pump();
      await tester.drainShadToastTimers();
      repository.succeeds = true;
      await tester.tap(find.text('Choose avatar'));
      await tester.pump();
      await tester.drainShadToastTimers();
      expect(repository.writes, ['actor-a', 'actor-a']);
      expect(picker.calls, [
        'source',
        'picker',
        'crop',
        'source',
        'picker',
        'crop',
      ]);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'closed auth owner drops a pending crop without an identity event',
    (tester) async {
      final picker = _Picker('crop');
      final (auth, repository, _, _) = await _pump(tester, picker);
      await tester.tap(find.text('Choose avatar'));
      await tester.pump();
      await auth.close();
      picker.release.complete();
      await tester.pumpAndSettle();
      expect(repository.writes, isEmpty);
    },
  );
  testWidgets('disposed widget drops a pending crop', (tester) async {
    final picker = _Picker('crop');
    final (_, repository, _, _) = await _pump(tester, picker);
    await tester.tap(find.text('Choose avatar'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    picker.release.complete();
    await tester.pumpAndSettle();
    expect(repository.writes, isEmpty);
  });
}
