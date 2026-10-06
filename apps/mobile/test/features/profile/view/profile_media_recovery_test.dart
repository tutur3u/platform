import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:mobile/features/profile/view/profile_media_recovery.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

AuthState _user({
  String id = 'actor-a',
  String email = 'synthetic@tuturuuu.com',
  bool confirmed = true,
}) => AuthState.authenticated(
  supa.User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '',
    email: email,
    emailConfirmedAt: confirmed ? '2026-01-01' : null,
  ),
);

class _Auth extends Cubit<AuthState> implements AuthCubit {
  _Auth(super.initialState);
  void change(AuthState state) => emit(state);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Repository extends ProfileRepository {
  _Repository(this.failure, this.actor);
  final ApiException failure;
  final String? Function() actor;
  int writes = 0;
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
  Future<ProfileMediaResult> saveAvatarResult(File file) async {
    writes++;
    return ProfileMediaResult.failure(failure);
  }
}

class _Picker extends ProfileAvatarPicker {
  int selections = 0;
  @override
  Future<ImageSource?> chooseSource(BuildContext context) async {
    selections++;
    return null;
  }
}

Future<(_Auth, _Repository, ProfileCubit, _Picker)> _pump(
  WidgetTester tester,
  ApiException error, {
  AuthState? user,
}) async {
  ProfileCubit.clearMemoryCache();
  final auth = _Auth(user ?? _user());
  final repository = _Repository(error, () => auth.state.user?.id);
  final cubit = ProfileCubit(profileRepository: repository);
  final picker = _Picker();
  await cubit.loadProfile();
  await cubit.uploadAvatar(File('/synthetic/profile.png'));
  addTearDown(cubit.close);
  addTearDown(auth.close);
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<ProfileCubit>.value(value: cubit),
      ],
      child: Scaffold(
        body: BlocBuilder<ProfileCubit, ProfileState>(
          builder: (context, state) =>
              ProfileMediaRecovery(state: state, avatarPicker: picker),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (auth, repository, cubit, picker);
}

void main() {
  for (final (status, english, vietnamese) in [
    (
      400,
      'Choose a valid JPEG, PNG, WebP or GIF within the image limits.',
      'Chọn ảnh JPEG, PNG, WebP hoặc GIF hợp lệ trong giới hạn kích thước.',
    ),
    (
      413,
      'The image is too large. Choose a smaller image.',
      'Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.',
    ),
    (
      403,
      'This upload is not authorized. Check your account and permissions '
          'before trying again.',
      'Bạn chưa được phép tải ảnh này lên. '
          'Kiểm tra tài khoản và quyền truy cập trước khi thử lại.',
    ),
    (
      409,
      'Your profile changed during the upload. Select the image again.',
      'Hồ sơ đã thay đổi trong lúc tải lên. Hãy chọn lại ảnh.',
    ),
    (
      429,
      'The upload limit was reached. Wait 60 seconds before trying again.',
      'Đã đạt giới hạn tải lên. Hãy chờ 60 giây trước khi thử lại.',
    ),
    (
      503,
      'Uploading is temporarily unavailable. Try a fresh selection later.',
      'Tạm thời không thể tải ảnh lên. Hãy chọn lại ảnh và thử sau.',
    ),
  ]) {
    for (final locale in ['en', 'vi']) {
      testWidgets('$locale HTTP$status shows safe localized recovery', (
        tester,
      ) async {
        tester.platformDispatcher.localesTestValue = [Locale(locale)];
        addTearDown(tester.platformDispatcher.clearLocalesTestValue);
        await _pump(
          tester,
          ApiException(
            message: 'synthetic-private-url',
            code: 'synthetic-private-code',
            statusCode: status,
            retryAfter: 60,
          ),
        );
        expect(
          find.text(locale == 'en' ? english : vietnamese),
          findsOneWidget,
        );
        expect(find.textContaining('synthetic-private'), findsNothing);
      });
    }
  }
  testWidgets('retained dismiss cannot clear a newer actor failure', (
    tester,
  ) async {
    final (auth, _, cubit, _) = await _pump(
      tester,
      const ApiException(message: 'synthetic', statusCode: 409),
    );
    final dismiss = tester
        .widget<shad.GhostButton>(
          find.widgetWithText(shad.GhostButton, 'Dismiss'),
        )
        .onPressed!;
    auth.change(_user(id: 'actor-b'));
    await cubit.loadProfile();
    await cubit.uploadAvatar(File('/synthetic/new.png'));
    await tester.pumpAndSettle();
    final newer = cubit.state.mediaFailure;
    expect(newer, isNotNull);
    dismiss();
    await tester.pumpAndSettle();
    expect(cubit.state.mediaFailure, same(newer));
    expect(cubit.state.profile?.id, 'actor-b');
  });
  testWidgets('retained retry cannot replace a newer same actor failure', (
    tester,
  ) async {
    final (_, repository, cubit, picker) = await _pump(
      tester,
      const ApiException(message: 'synthetic', statusCode: 409),
    );
    final retry = tester
        .widget<shad.OutlineButton>(
          find.widgetWithText(shad.OutlineButton, 'Select image again'),
        )
        .onPressed!;
    await cubit.uploadAvatar(File('/synthetic/new.png'));
    await tester.pumpAndSettle();
    final newer = cubit.state.mediaFailure;
    expect(newer, isNotNull);
    retry();
    await tester.pumpAndSettle();
    expect(picker.selections, 0);
    expect(repository.writes, 2);
    expect(cubit.state.mediaFailure, same(newer));
  });
  testWidgets('fresh selection clears failure without replaying old bytes', (
    tester,
  ) async {
    final (_, repository, cubit, picker) = await _pump(
      tester,
      const ApiException(message: 'synthetic', statusCode: 409),
    );
    await tester.tap(find.text('Select image again'));
    await tester.pumpAndSettle();
    expect(picker.selections, 1);
    expect(repository.writes, 1);
    expect(cubit.state.mediaFailure, isNull);
    expect(find.text('Profile image could not be updated'), findsNothing);
  });
  testWidgets(
    'internal copy is fixed fields and revoked on same actor email change',
    (tester) async {
      final copied = <String>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'Clipboard.setData') {
              copied.add((call.arguments as Map)['text'] as String);
            }
            return null;
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );
      final (auth, _, _, _) = await _pump(
        tester,
        const ApiException(
          message: 'synthetic-private',
          code: 'synthetic-private',
          statusCode: 429,
          retryAfter: 60,
        ),
      );
      final callback = tester
          .widget<IconButton>(find.byType(IconButton))
          .onPressed!;
      await tester.tap(find.byType(IconButton));
      const expected =
          'diagnostics=v1; stage=profileUpload; kind=http; '
          'status=429; retryAfter=60';
      expect(copied, [expected]);
      auth.change(_user(email: 'synthetic@example.test'));
      await tester.pumpAndSettle();
      expect(find.byType(IconButton), findsNothing);
      callback();
      await tester.pump();
      expect(copied.length, 1);
      auth.change(const AuthState.unauthenticated());
      await tester.pumpAndSettle();
      expect(find.text('Profile image could not be updated'), findsNothing);
    },
  );
  for (final user in [
    _user(email: 'synthetic@example.test'),
    _user(confirmed: false),
  ]) {
    testWidgets('ineligible account ${user.user?.emailConfirmedAt} '
        'has guidance but no copy', (tester) async {
      await _pump(
        tester,
        const ApiException(message: 'synthetic', statusCode: 503),
        user: user,
      );
      expect(find.text('Profile image could not be updated'), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
    });
  }
}
