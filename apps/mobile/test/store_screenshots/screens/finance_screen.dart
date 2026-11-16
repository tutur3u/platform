import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fixtures/shell_frame_fixture.dart';
import '../fixtures/store_team.dart';
import '../store_screenshot_app.dart';

/// The finance overview for the studio: net balance, wallets and the week's
/// recent transactions with their categories.
const StoreScreen financeStoreScreen = StoreScreen(
  id: 'finance',
  order: 5,
  build: _build,
  prepare: _seedAndShow,
);

/// The page builds its own repository and reads the overview that
/// initStoreCache seeded; it mounts after the shell frame settles.
final ValueNotifier<bool> _cacheReady = ValueNotifier(false);

Future<void> _seedAndShow(WidgetTester tester, StoreLocale locale) async {
  _cacheReady.value = true;
  await settleStoreScreen(tester);
}

Widget _build(StoreLocale locale) {
  SharedPreferences.setMockInitialValues({});
  _cacheReady.value = false;
  final settings = SettingsRepository();
  return storeShellFrame(
    location: Routes.finance,
    workspaceId: StoreTeam.localeWorkspaceId(locale),
    providers: [
      BlocProvider<FinancePreferencesCubit>(
        create: (_) {
          final preferences = FinancePreferencesCubit(
            settingsRepository: settings,
          );
          unawaited(preferences.setShowAmounts(value: true));
          return preferences;
        },
      ),
    ],
    child: ValueListenableBuilder<bool>(
      valueListenable: _cacheReady,
      builder: (context, ready, _) =>
          ready ? const FinancePage() : const SizedBox.shrink(),
    ),
  );
}
