import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Apps hub shows app cards without search', (tester) async {
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(cubit.close);

    await tester.pumpApp(
      BlocProvider.value(
        value: cubit,
        child: const AppsHubPage(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pumpAndSettle();

    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Calendar'), findsOneWidget);
    expect(find.text('Finance'), findsOneWidget);
    expect(find.text('Timer'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });
}
