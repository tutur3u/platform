import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Repository extends Mock implements ProfileRepository {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

const _profile = UserProfile(
  id: 'user-1',
  displayName: 'Linh Tran',
  fullName: 'Tran Thuy Linh',
  email: 'linh@example.test',
);

/// Edit profile renders for review; runs only with SETTINGS_RENDER_DIR.
void main() {
  final output = Platform.environment['SETTINGS_RENDER_DIR'];

  setUpAll(() async {
    registerFallbackValue(const UserProfile(id: 'fallback'));
    if (output == null) return;
    // Real glyphs for the Material default family, as in the Settings renders.
    final materialFont = Platform.environment['SETTINGS_MATERIAL_FONT'];
    await (FontLoader('Roboto')..addFont(
          materialFont == null
              ? rootBundle.load('assets/fonts/NotoSans.ttf')
              : File(materialFont).readAsBytes().then(ByteData.sublistView),
        ))
        .load();
    for (final font in {
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'packages/shadcn_flutter/LucideIcons':
          'packages/shadcn_flutter/lib/icons/LucideIcons.ttf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });

  for (final brightness in Brightness.values) {
    testWidgets('Edit profile render ${brightness.name}', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      ProfileCubit.clearMemoryCache();
      final repository = _Repository();
      final auth = _Auth();
      final state = AuthState.authenticated(
        supa.User.fromJson({
          'id': 'user-1',
          'aud': 'authenticated',
          'email': 'linh@example.test',
          'app_metadata': const <String, dynamic>{},
          'user_metadata': const <String, dynamic>{},
          'created_at': '2024-01-01T00:00:00.000000Z',
        })!,
      );
      whenListen(auth, const Stream<AuthState>.empty(), initialState: state);
      when(() => auth.isClosed).thenReturn(false);
      when(repository.getCurrentUserIdSync).thenReturn('user-1');
      when(
        repository.getCachedProfile,
      ).thenAnswer((_) async => (profile: _profile, fetchedAt: DateTime.now()));
      when(
        repository.getProfile,
      ).thenAnswer((_) async => (profile: _profile, error: null));
      when(() => repository.saveCachedProfile(any())).thenAnswer((_) async {});
      when(repository.dispose).thenReturn(null);
      const appearance = AppearanceSettings();
      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider(
              create: (_) => ShellProfileCubit(profileRepository: repository),
            ),
          ],
          child: shad.ShadcnApp(
            theme: AppearanceTheme.shadTheme(appearance, brightness),
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              AppShadcnLocalizationsDelegate(),
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: ShadcnMaterialBridge.appBuilder,
            home: RepaintBoundary(
              key: const ValueKey('profile-render'),
              child: ProfilePage(profileRepository: repository),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Linh Tran'), findsWidgets);
      expect(find.text('Cover banner'), findsOneWidget);
      // An unknown join date is omitted.
      expect(find.text('Member since', skipOffstage: false), findsNothing);
      if (output == null) return;
      final ratio = double.tryParse(
        Platform.environment['SETTINGS_RENDER_PIXEL_RATIO'] ?? '',
      );
      await tester.runAsync(() async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(const ValueKey('profile-render')),
        );
        final image = await boundary.toImage(pixelRatio: ratio ?? 1);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory(output).create(recursive: true);
        await File(
          '$output/settings-edit-profile-${brightness.name}.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    });
  }
}
