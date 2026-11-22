import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/sorbet_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/data/sorbet_preferences_repository.dart';
import 'package:mobile/features/settings/view/appearance/appearance_page.dart';
import 'package:mobile/features/settings/view/appearance/appearance_theme_gallery.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';

/// Signed-out device: no account requests.
class _DeviceOnly extends SorbetPreferencesRepository {}

void main() {
  late ThemeCubit theme;
  late SorbetCubit sorbet;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    theme = ThemeCubit(settingsRepository: SettingsRepository());
    sorbet = SorbetCubit(repository: _DeviceOnly());
    await sorbet.bindAccount(null);
  });
  tearDown(() async {
    await theme.close();
    await sorbet.close();
  });

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: theme),
          BlocProvider.value(value: sorbet),
        ],
        child: const AppearancePage(),
      ),
    );
    await tester.pumpAndSettle();
  }

  final palette = find.byKey(const ValueKey('appearance-sorbet-palette'));
  final toggle = find.byKey(const ValueKey('appearance-sorbet'));

  testWidgets('the switch shows the Sorbet options and hides classic ones', (
    tester,
  ) async {
    await pumpPage(tester);
    expect(find.text('Experimental design'), findsOneWidget);
    expect(sorbet.state.enabled, isTrue);
    expect(palette, findsOneWidget);
    expect(find.byType(AppearanceThemeGallery), findsNothing);

    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(sorbet.state.enabled, isFalse);
    expect(palette, findsNothing);
    expect(find.byType(AppearanceThemeGallery), findsOneWidget);

    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(sorbet.state.enabled, isTrue);
    expect(palette, findsOneWidget);
    expect(
      find.byKey(const ValueKey('appearance-sorbet-radius')),
      findsOneWidget,
    );
    expect(find.byType(AppearanceThemeGallery), findsNothing);
    expect(find.byKey(const ValueKey('appearance-corners')), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('appearance-sorbet-preset-lavender')),
    );
    await tester.pumpAndSettle();
    expect(sorbet.state.theme.preset, SorbetPreset.lavender);

    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(sorbet.state.enabled, isFalse);
    expect(palette, findsNothing);
    expect(find.byType(AppearanceThemeGallery), findsOneWidget);
  });
}
