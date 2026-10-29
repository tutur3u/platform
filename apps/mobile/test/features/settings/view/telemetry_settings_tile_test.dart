import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/telemetry_settings_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('label and switch both persist and apply collection choice', (
    tester,
  ) async {
    final applied = <bool>[];
    final preference = TelemetryPreference(countryCode: 'DE');
    await preference.initialize(
      apply: ({required enabled}) async => applied.add(enabled),
    );
    await tester.pumpApp(TelemetrySettingsTile(preference: preference));
    await tester.pumpAndSettle();
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isFalse);
    await tester.tap(find.text('Share analytics and crash reports'));
    await tester.pumpAndSettle();
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isTrue);
    expect(
      (await SharedPreferences.getInstance()).getBool(
        TelemetryPreference.preferenceKey,
      ),
      isTrue,
    );
    await tester.tap(find.byType(AppSwitch));
    await tester.pumpAndSettle();
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isFalse);
    expect(applied, [false, true, false]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('uninitialized preference cannot enable collection', (
    tester,
  ) async {
    final preference = TelemetryPreference(countryCode: 'US');
    await tester.pumpApp(TelemetrySettingsTile(preference: preference));
    await tester.pumpAndSettle();
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).onChanged, isNull);
    await tester.tap(find.text('Share analytics and crash reports'));
    await tester.pumpAndSettle();
    expect(preference.enabled, isFalse);
  });
}
