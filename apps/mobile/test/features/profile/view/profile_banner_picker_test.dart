import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_banner.dart';
import 'package:mobile/features/profile/view/profile_banner_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

AuthState _signedIn(String actor) => AuthState.authenticated(
  supa.User(
    id: actor,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '',
  ),
);

class _Auth extends Cubit<AuthState> implements AuthCubit {
  _Auth() : super(_signedIn('actor-a'));
  void change(AuthState value) => emit(value);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Repository extends ProfileRepository {
  _Repository(this.actor);
  final String? Function() actor;
  final writes = <String?>[];
  bool succeeds = true;
  List<Completer<ProfileMediaResult>>? pending;
  @override
  String? getCurrentUserIdSync() => actor();
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async =>
      (profile: UserProfile(id: actor()!), error: null);
  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: null, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async {}
  @override
  Future<ProfileMediaResult> saveBannerResult(File file) async {
    writes.add(actor());
    if (pending != null) {
      final result = Completer<ProfileMediaResult>();
      pending!.add(result);
      return await result.future;
    }
    return succeeds
        ? const ProfileMediaResult.success()
        : ProfileMediaResult.failure(
            const ApiException(message: 'synthetic-private', statusCode: 413),
          );
  }
}

class _Picker extends ProfileBannerPicker {
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
    return name == cancelAt ? null : value;
  }

  @override
  Future<ImageSource?> chooseSource(BuildContext context) =>
      _step('source', ImageSource.gallery);
  @override
  Future<File?> pickImage(ImageSource source) =>
      _step('picker', File('/synthetic/banner.png'));
}

late ValueNotifier<(_Auth, ProfileCubit)> _owners;
late BuildContext _chooserContext;

Widget _view(_Auth auth, ProfileCubit cubit, _Picker picker) =>
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<ProfileCubit>.value(value: cubit),
      ],
      child: Builder(
        builder: (context) {
          _chooserContext = context;
          return Scaffold(
            body: Column(
              children: [
                TextButton(
                  onPressed: () =>
                      pickAndUploadProfileBanner(context, picker: picker),
                  child: const Text('choose'),
                ),
                BlocBuilder<ProfileCubit, ProfileState>(
                  builder: (context, state) => ProfileBannerSettings(
                    profile: state.profile ?? const UserProfile(id: 'actor-a'),
                    busy: state.isLoading,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
Future<(_Auth, _Repository, ProfileCubit)> _pump(
  WidgetTester tester,
  _Picker picker,
) async {
  ProfileCubit.clearMemoryCache();
  final auth = _Auth();
  final repository = _Repository(() => auth.state.user?.id);
  final cubit = ProfileCubit(profileRepository: repository);
  await cubit.loadProfile();
  addTearDown(() async {
    if (!cubit.isClosed) await cubit.close();
    if (!auth.isClosed) await auth.close();
  });
  _owners = ValueNotifier((auth, cubit));
  addTearDown(_owners.dispose);
  await tester.pumpApp(
    ValueListenableBuilder(
      valueListenable: _owners,
      builder: (context, owners, _) => _view(owners.$1, owners.$2, picker),
    ),
  );
  return (auth, repository, cubit);
}

void main() {
  for (final stage in ['source', 'picker']) {
    for (final departure in ['switch', 'logout', 'ABA', 'MFA']) {
      testWidgets('$stage $departure never writes', (tester) async {
        final picker = _Picker(stage);
        final (auth, repository, _) = await _pump(tester, picker);
        await tester.tap(find.text('choose'));
        await tester.pump();
        await picker.entered.future;
        auth.change(
          departure == 'switch'
              ? _signedIn('actor-b')
              : departure == 'MFA'
              ? AuthState.mfaRequired(_signedIn('actor-a').user!)
              : const AuthState.unauthenticated(),
        );
        await tester.pump();
        if (departure == 'ABA') {
          auth.change(_signedIn('actor-a'));
          await tester.pump();
        }
        picker.release.complete();
        await tester.pumpAndSettle();
        expect(repository.writes, isEmpty);
        expect(
          picker.calls,
          stage == 'source' ? ['source'] : ['source', 'picker'],
        );
      });
    }
  }
  for (final replace in [
    'auth',
    'cubit',
    'closed-auth',
    'closed-cubit',
    'dispose',
  ]) {
    testWidgets('deferred picker rejects $replace', (tester) async {
      final picker = _Picker('picker');
      final (auth, repository, cubit) = await _pump(tester, picker);
      await tester.tap(find.text('choose'));
      await tester.pump();
      await picker.entered.future;
      final capturedContext = _chooserContext;
      if (replace == 'closed-auth') await auth.close();
      if (replace == 'closed-cubit') await cubit.close();
      if (replace == 'dispose') await tester.pumpApp(const SizedBox());
      if (replace == 'auth') {
        final replacement = _Auth();
        addTearDown(replacement.close);
        _owners.value = (replacement, cubit);
        await tester.pump();
        expect(capturedContext.mounted, isTrue);
      }
      if (replace == 'cubit') {
        final replacement = ProfileCubit(
          profileRepository: _Repository(() => 'actor-a'),
        );
        await replacement.loadProfile();
        addTearDown(replacement.close);
        _owners.value = (auth, replacement);
        await tester.pump();
        expect(capturedContext.mounted, isTrue);
      }
      picker.release.complete();
      await tester.pumpAndSettle();
      expect(repository.writes, isEmpty);
    });
  }
  for (final canceled in ['source', 'picker']) {
    testWidgets('$canceled cancellation permits a fresh success', (
      tester,
    ) async {
      final picker = _Picker('none')..cancelAt = canceled;
      final (_, repository, _) = await _pump(tester, picker);
      await tester.tap(find.text('choose'));
      await tester.pumpAndSettle();
      expect(repository.writes, isEmpty);
      picker.cancelAt = null;
      await tester.tap(find.text('choose'));
      await tester.pumpAndSettle();
      expect(repository.writes, ['actor-a']);
    });
  }
  for (final locale in ['en', 'vi']) {
    testWidgets('$locale banner failure is visible at active chooser', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = [Locale(locale)];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      final picker = _Picker('none');
      final (_, repository, _) = await _pump(tester, picker);
      repository.succeeds = false;
      await tester.tap(find.text('choose'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          locale == 'en'
              ? 'The image is too large. Choose a smaller image.'
              : 'Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('synthetic-private'), findsNothing);
    });
  }
  testWidgets(
    'superseded banner result cannot replace active failure guidance',
    (tester) async {
      final picker = _Picker('none');
      final (auth, repository, cubit) = await _pump(tester, picker);
      repository.pending = [];
      final first = cubit.uploadBanner(File('/synthetic/first.png'));
      final second = cubit.uploadBanner(File('/synthetic/second.png'));
      repository.pending![0].complete(
        ProfileMediaResult.failure(
          const ApiException(message: 'synthetic-private', statusCode: 413),
        ),
      );
      expect(await first, isFalse);
      await tester.pumpAndSettle();
      expect(find.textContaining('Choose a smaller image'), findsNothing);
      repository.pending![1].complete(
        ProfileMediaResult.failure(
          const ApiException(message: 'synthetic-private', statusCode: 409),
        ),
      );
      expect(await second, isFalse);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Your profile changed during the upload. Select the image again.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Choose a smaller image'), findsNothing);
      auth.change(_signedIn('actor-b'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Your profile changed'), findsNothing);
    },
  );
  testWidgets('failed upload permits a new selection without replaying', (
    tester,
  ) async {
    final picker = _Picker('none');
    final (_, repository, cubit) = await _pump(tester, picker);
    repository.succeeds = false;
    await tester.tap(find.text('choose'));
    await tester.pumpAndSettle();
    expect(cubit.state.mediaFailure, isNotNull);
    repository.succeeds = true;
    await tester.tap(find.text('choose'));
    await tester.pumpAndSettle();
    expect(repository.writes, ['actor-a', 'actor-a']);
    expect(cubit.state.mediaFailure, isNull);
    expect(picker.calls, ['source', 'picker', 'source', 'picker']);
  });
}
