import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#access-requests
void main() {
  late FakeFleetSource source;
  late MastermindViewHarness harness;
  late DateTime clock;
  final launched = <Uri>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    clock = fleetTestNow;
    launched.clear();
    source = FakeFleetSource(
      json: fleetSampleJson(
        decisions: [
          fleetLoginJson(),
          fleetLoginJson(
            id: 'login-cf',
            service: 'cloudflare',
            flow: 'local_callback',
            url: 'https://dash.cloudflare.com/oauth2/auth',
            userCode: null,
            machineId: 'skr-m4',
          ),
        ],
      ),
    );
    harness = MastermindViewHarness(
      fleet: FleetCubit(source: source, newKey: () => 'key-1'),
    );
    await harness.setAccess(TestAccess.enabled);
  });

  tearDown(() => harness.dispose());

  Future<void> pump(WidgetTester tester, {Widget Function(Widget)? app}) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    final page = harness.wrap(
      FleetInboxPage(
        now: () => clock,
        launch: (uri, mode) async {
          launched.add(uri);
          return true;
        },
      ),
    );
    await tester.pumpWidget(
      app?.call(page) ??
          DesignRenderApp(
            settings: settings,
            brightness: brightness,
            child: page,
          ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('a device login shows its code, copies it and opens the link', (
    tester,
  ) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await pump(tester);
    expect(find.text('Access requests'), findsOneWidget);
    expect(find.text('GitHub on MacStudio1'), findsOneWidget);
    expect(find.text('Waiting for you'), findsNWidgets(2));
    expect(find.text('8F3K-Q2MX'), findsOneWidget);
    expect(find.text('Expires in 10:00'), findsNWidgets(2));
    expect(
      find.text('The release bot sign-off needs repo scope.'),
      findsWidgets,
    );

    await tester.tap(find.text('Copy code'));
    await tester.pump();
    expect(copied, ['8F3K-Q2MX']);
    expect(find.text('Code copied'), findsOneWidget);

    await tester.tap(find.text('Open github.com'));
    await tester.pump();
    expect(launched, [Uri.parse('https://github.com/login/device')]);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a local callback names its machine and opens nothing', (
    tester,
  ) async {
    await pump(tester);
    expect(find.text('Cloudflare on M4'), findsOneWidget);
    expect(find.text('Finish on M4'), findsOneWidget);
    expect(find.text('Open dash.cloudflare.com'), findsNothing);
  });

  testWidgets('I signed in posts signed_in and waits for the agent', (
    tester,
  ) async {
    await pump(tester);
    await tester.tap(find.text('I signed in').first);
    await tester.pump();
    await tester.pump();
    expect(source.answers.first['decisionId'], 'login-gh');
    expect(source.answers.first['action'], FleetAnswerAction.signedIn);
    expect(find.text('Signed in · Waiting for Iris'), findsOneWidget);
    // The provider link stays while the agent has not verified the sign-in.
    expect(find.text('Open github.com'), findsOneWidget);
    expect(find.text('I signed in'), findsOneWidget);
  });

  testWidgets('a closed request says so instead of offering Retry', (
    tester,
  ) async {
    source.answerError = const ApiException(message: 'x', statusCode: 409);
    await pump(tester);
    await tester.tap(find.text('I signed in').first);
    await tester.pump();
    await tester.pump();
    expect(find.text('This request has already closed'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('a failed sign-in send offers no Retry once expired', (
    tester,
  ) async {
    source.answerError = const ApiException.transport(message: 'offline');
    await pump(tester);
    await tester.tap(find.text('I signed in').first);
    await tester.pump();
    await tester.pump();
    expect(find.text('Retry'), findsOneWidget);
    clock = DateTime.utc(2026, 11, 20, 3, 12);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Not sent'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('the countdown reaching expiry hides the code and link', (
    tester,
  ) async {
    await pump(tester);
    clock = DateTime.utc(2026, 11, 20, 3, 11, 59);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Expires in 00:01'), findsNWidgets(2));

    clock = DateTime.utc(2026, 11, 20, 3, 12);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Expired'), findsNWidgets(2));
    expect(find.text('8F3K-Q2MX'), findsNothing);
    expect(find.text('Open github.com'), findsNothing);
    expect(find.text('I signed in'), findsNothing);
  });

  testWidgets('approved, verified and failed states', (tester) async {
    source.json = fleetSampleJson(
      decisions: [
        fleetLoginJson(id: 'a', state: 'approved'),
        fleetLoginJson(
          id: 'v',
          state: 'verified',
          url: null,
          userCode: null,
          expiresAt: null,
        ),
        fleetLoginJson(
          id: 'f',
          state: 'failed',
          url: null,
          userCode: null,
          expiresAt: null,
        ),
      ],
    );
    await pump(tester);
    expect(find.text('Checking sign-in'), findsOneWidget);
    expect(find.text('8F3K-Q2MX'), findsOneWidget);
    expect(find.text('I signed in'), findsNothing);
    expect(find.text('Verified by agent'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Sign-in not detected'),
      200,
      scrollable: find
          .byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          )
          .first,
    );
    expect(find.text('Sign-in not detected'), findsOneWidget);
    expect(find.text('I signed in'), findsNothing);
  });

  testWidgets('the code row fits a narrow phone at a large text size', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(320, 720)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    source.json = fleetSampleJson(
      decisions: [fleetLoginJson(userCode: 'ABCDEFGH-ABCDEFGH-ABCDEFGH')],
    );
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: Size(320, 720),
          textScaler: TextScaler.linear(2),
        ),
        child: DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: harness.wrap(FleetInboxPage(now: () => clock)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('Copy code'), findsOneWidget);
  });

  for (final brightness in Brightness.values) {
    testWidgets('renders access requests in Sorbet ${brightness.name}', (
      tester,
    ) async {
      await pump(
        tester,
        app: (page) => sorbetTestApp(
          sorbet: const SorbetTheme(),
          brightness: brightness,
          home: page,
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('8F3K-Q2MX'), findsOneWidget);
    });
  }
}
