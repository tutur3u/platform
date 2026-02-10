import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Apps hub shows apps and filters by search', (tester) async {
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(cubit.close);

    await tester.pumpApp(
      BlocProvider.value(
        value: cubit,
        child: const AppsHubPage(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Calendar'), findsOneWidget);

    await tester.enterText(find.byType(shad.TextField), 'cal');
    await tester.pumpAndSettle();

    expect(find.text('Calendar'), findsOneWidget);
    expect(find.text('Tasks'), findsNothing);
  });
}
