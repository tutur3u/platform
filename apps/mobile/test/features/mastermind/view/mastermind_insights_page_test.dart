import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/usage/usage_content.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

import '../../../helpers/mastermind_fleet_usage_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';

Future<void> _refresh(WidgetTester tester) async {
  await tester
      .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
      .onRefresh();
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows an explicit empty report', (tester) async {
    await pumpInsights(
      tester,
      FakeFleetUsageSource(fleetUsageFixture(empty: true)),
    );

    expect(find.text('No usage data reported.'), findsOneWidget);
    expect(find.byType(DataTable), findsNothing);
  });

  testWidgets('a forbidden refresh removes the previous report', (
    tester,
  ) async {
    final source = FakeFleetUsageSource(fleetUsageFixture());
    await pumpInsights(tester, source);
    expect(find.text(fleetUsageEmail), findsOneWidget);

    source.error = const ApiException(message: 'Forbidden', statusCode: 403);
    await _refresh(tester);

    expect(
      find.text("This account isn't allowed to view Mastermind"),
      findsOneWidget,
    );
    expect(find.text(fleetUsageEmail), findsNothing);
    expect(find.byType(UsageContent), findsNothing);
  });

  testWidgets('a failed refresh retains the report below the warning', (
    tester,
  ) async {
    final source = FakeFleetUsageSource(fleetUsageFixture());
    await pumpInsights(tester, source);
    source.error = const ApiException(message: 'Unavailable', statusCode: 503);
    await _refresh(tester);

    final warning = find.textContaining("Couldn't refresh");
    final email = find.text(fleetUsageEmail);
    expect(warning, findsOneWidget);
    expect(
      tester.getTopLeft(warning).dy,
      lessThan(tester.getTopLeft(email).dy),
    );
  });

  testWidgets('an older receipt reads as last received', (tester) async {
    final receipt = DateTime.now().toUtc().subtract(const Duration(minutes: 5));
    await pumpInsights(
      tester,
      FakeFleetUsageSource(fleetUsageFixture(receivedAt: receipt)),
    );

    expect(find.textContaining('Last received'), findsOneWidget);
    expect(find.textContaining('Updated'), findsNothing);
    expect(find.text(fleetUsageEmail), findsOneWidget);
  });

  testWidgets('unreported quota is a dash and reported zero stays zero', (
    tester,
  ) async {
    await pumpInsights(
      tester,
      FakeFleetUsageSource(fleetUsageFixture(sessionUsed: 0)),
    );

    expect(find.text('Session used · 0%'), findsOneWidget);
    expect(find.text('Weekly used · —'), findsOneWidget);
    expect(find.text('Weekly used · 0%'), findsNothing);
  });

  testWidgets('reset is ICT and includes the date when it crosses a day', (
    tester,
  ) async {
    await pumpInsights(
      tester,
      FakeFleetUsageSource(
        fleetUsageFixture(
          checkedAt: DateTime.utc(2026, 11, 21, 16),
          sessionReset: DateTime.utc(2026, 11, 21, 16, 34, 56),
          weeklyReset: DateTime.utc(2026, 11, 21, 17, 23, 45),
        ),
      ),
    );

    expect(find.textContaining('23:34:56 ICT ·'), findsOneWidget);
    expect(find.textContaining('Nov 21, 2026 23:34:56'), findsNothing);
    expect(find.textContaining('Nov 22, 2026 00:23:45 ICT'), findsOneWidget);
  });

  testWidgets('cost charts and token table display the fleet accounting rows', (
    tester,
  ) async {
    await pumpInsights(tester, FakeFleetUsageSource(fleetUsageFixture()));

    expect(find.text('Cost by day (USD, ICT)'), findsOneWidget);
    expect(find.text('Cost by account (USD)'), findsOneWidget);
    expect(find.text('Cost by model (USD)'), findsOneWidget);
    expect(find.text(r'2026-11-21 · $2.50'), findsOneWidget);
    expect(find.text('$fleetUsageEmail · \$2.50'), findsOneWidget);
    expect(find.text('$fleetUsageModel · \$2.50'), findsOneWidget);
    final table = find.byType(DataTable);
    for (final value in [fleetUsageModel, '42', '12', '3', '9']) {
      expect(
        find.descendant(of: table, matching: find.text(value)),
        findsOneWidget,
      );
    }
  });
}
