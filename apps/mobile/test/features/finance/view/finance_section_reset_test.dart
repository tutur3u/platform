import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/helpers.dart';

class _WorkspaceCubit extends Mock implements WorkspaceCubit {}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  testWidgets('finance reselection resets Tags to Categories', (tester) async {
    final workspace = _WorkspaceCubit();
    when(() => workspace.state).thenReturn(const WorkspaceState());
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    final chrome = ShellChromeActionsCubit();
    final miniNav = ShellMiniNavCubit();
    final preferences = FinancePreferencesCubit(
      settingsRepository: SettingsRepository(),
    );
    addTearDown(chrome.close);
    addTearDown(miniNav.close);
    addTearDown(preferences.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: miniNav),
          BlocProvider.value(value: preferences),
        ],
        child: const TransactionCategoriesPage(),
      ),
    );
    await tester.pumpAndSettle();
    miniNav.state
        .resolveForLocation(Routes.categories)!
        .items
        .firstWhere((item) => item.id == 'tags')
        .onPressed!();
    await tester.pumpAndSettle();
    expect(
      miniNav.state
          .resolveForLocation(Routes.categories)!
          .items
          .firstWhere((item) => item.id == 'tags')
          .selected,
      isTrue,
    );
    chrome.state.resetSectionForLocation(Routes.categories)!();
    await tester.pumpAndSettle();
    expect(
      miniNav.state
          .resolveForLocation(Routes.categories)!
          .items
          .firstWhere((item) => item.id == 'categories')
          .selected,
      isTrue,
    );
    expect(tester.takeException(), isNull);
  });
}
