import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_routes.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/pump_app.dart';
import 'fleet_access_fakes.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
void main() {
  late FakeFleetAccessSource source;
  late FleetAccessCubit access;

  setUp(() {
    source = FakeFleetAccessSource();
    access = FleetAccessCubit(source: source);
  });

  tearDown(() => access.close());

  Future<void> pump(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      BlocProvider<FleetAccessCubit>.value(
        value: access,
        child: Scaffold(body: child),
      ),
    );
    await tester.pumpAndSettle();
  }

  DateTime now() => fleetAccessTestNow;

  group('entry visibility', () {
    late ShellChromeActionsCubit chrome;

    setUp(() => chrome = ShellChromeActionsCubit());
    tearDown(() => chrome.close());

    Future<void> pumpEntry(WidgetTester tester) => pump(
      tester,
      BlocProvider<ShellChromeActionsCubit>.value(
        value: chrome,
        child: const FleetAccessTodayAction(),
      ),
    );

    Iterable<String> todayActions() => chrome.state
        .resolveForLocation(Routes.mastermind)
        .map((action) => action.id);

    testWidgets('hidden while disabled', (tester) async {
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess.disabled());
      await pumpEntry(tester);
      expect(source.accessCalls, 1);
      expect(todayActions(), isEmpty);
    });

    testWidgets('shown on Today while enabled, gone once revoked', (
      tester,
    ) async {
      source.accessAnswers
        ..clear()
        ..addAll([observerAccess, const FleetAccess.disabled()]);
      await pumpEntry(tester);
      expect(todayActions(), ['mastermind-fleet-access']);
      expect(chrome.state.resolveForLocation(Routes.mastermindInbox), isEmpty);

      await access.handleForbidden();
      await tester.pumpAndSettle();
      expect(todayActions(), isEmpty);
    });

    testWidgets('a failed check shows nothing', (tester) async {
      source.accessAnswers
        ..clear()
        ..add(fleetApiError(503));
      await pumpEntry(tester);
      expect(todayActions(), isEmpty);
    });

    testWidgets('the Requests entry follows the same answer', (tester) async {
      await pump(
        tester,
        FleetAccessVisibility(
          builder: (context, visible) =>
              Text(visible ? 'requests-entry' : 'hidden'),
        ),
      );
      expect(find.text('requests-entry'), findsOneWidget);
    });
  });

  group('page', () {
    testWidgets('a revoke mid-session takes the views away', (tester) async {
      source.accessAnswers
        ..clear()
        ..addAll([observerAccess, const FleetAccess.disabled()]);
      await pump(tester, FleetAccessPage(now: now));
      expect(find.text('Release train'), findsOneWidget);

      source.digestAnswers
        ..clear()
        ..add(fleetApiError(403));
      await tester.drag(find.text('Release train'), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Release train'), findsNothing);
      expect(find.text('Status'), findsNothing);
      expect(access.state.visible, isFalse);
    });

    testWidgets('status shows times, lanes and the stale badge', (
      tester,
    ) async {
      source.digestAnswers
        ..clear()
        ..add(
          FleetDigest(
            sections: [
              section(),
              section(
                project: 'mobile',
                receivedAt: fleetAccessTestNow.subtract(
                  const Duration(hours: 2),
                ),
              ),
            ],
          ),
        );
      await pump(tester, FleetAccessPage(now: now));

      expect(find.text('platform'), findsOneWidget);
      expect(find.text('mobile'), findsOneWidget);
      expect(find.textContaining('Received'), findsNWidgets(2));
      expect(find.textContaining('Generated'), findsNWidgets(2));
      expect(
        find.byKey(const ValueKey('fleet-access-stale-mobile')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('fleet-access-stale-platform')),
        findsNothing,
      );
      expect(find.text('Blocked'), findsWidgets);
      // "Mobile review" is blocked on review in both projects.
      expect(find.text('Review'), findsNWidgets(2));
    });

    testWidgets('a fresh snapshot turns stale while it is held', (
      tester,
    ) async {
      var current = fleetAccessTestNow;
      await pump(tester, FleetAccessPage(now: () => current));
      final badge = find.byKey(const ValueKey('fleet-access-stale-platform'));
      expect(badge, findsNothing);
      current = current.add(const Duration(hours: 1));
      await tester.pump(const Duration(minutes: 1));
      expect(badge, findsOneWidget);
    });

    testWidgets('Approvals is not offered to a grant that cannot approve', (
      tester,
    ) async {
      await pump(
        tester,
        FleetAccessPage(initialView: FleetAccessView.approvals, now: now),
      );
      expect(find.text('Approvals'), findsNothing);
      // The link falls back to Status.
      expect(find.text('Release train'), findsOneWidget);
    });

    testWidgets('Approvals is read-only for a grant that approves', (
      tester,
    ) async {
      source.accessAnswers
        ..clear()
        ..add(operatorAccess);
      await pump(
        tester,
        FleetAccessPage(initialView: FleetAccessView.approvals, now: now),
      );
      expect(find.text('Approvals'), findsOneWidget);
      expect(
        find.text("Approvals aren't available in the app yet"),
        findsOneWidget,
      );
      expect(find.byType(AppButton), findsNothing);
    });
  });

  group('request form', () {
    Future<void> openForm(WidgetTester tester) async {
      await pump(
        tester,
        FleetAccessPage(initialView: FleetAccessView.requests, now: now),
      );
      expect(find.text('No requests yet'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('fleet-access-new-request')));
      await tester.pumpAndSettle();
    }

    Future<void> choose(
      WidgetTester tester,
      String field,
      String option,
    ) async {
      await tester.tap(find.byKey(ValueKey('fleet-access-field-$field')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(option).last);
      await tester.pumpAndSettle();
    }

    testWidgets('opens above the shell and refuses an incomplete request', (
      tester,
    ) async {
      await openForm(tester);
      expect(find.byType(FleetAccessPage), findsNothing);
      // The single grant project is preselected; the topic is not.
      expect(find.text('platform'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('fleet-access-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Required'), findsOneWidget);
      expect(source.submitted, isEmpty);

      await choose(tester, 'kind', 'Set priority');
      await tester.tap(find.byKey(const ValueKey('fleet-access-submit')));
      await tester.pumpAndSettle();
      // Target and priority.
      expect(find.text('Required'), findsNWidgets(2));

      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-field-target')),
        'Lane Alpha',
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Use lowercase letters, digits, - or _'),
        findsOneWidget,
      );
      expect(source.submitted, isEmpty);
    });

    testWidgets('sends a valid request and lists its receipt', (tester) async {
      source.intentAnswers
        ..clear()
        ..addAll([
          const FleetIntentPage(intents: []),
          FleetIntentPage(
            intents: [
              FleetIntentReceipt(
                id: 'fc000000-0000-4000-8000-000000000099',
                kind: FleetIntentKind.prioritySet,
                state: FleetIntentState.pendingApproval,
                createdAt: fleetAccessTestNow,
              ),
            ],
          ),
        ]);
      await openForm(tester);
      await choose(tester, 'kind', 'Set priority');
      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-field-target')),
        'lane-alpha',
      );
      await choose(tester, 'priority', 'High');
      await tester.tap(find.byKey(const ValueKey('fleet-access-submit')));
      await tester.pumpAndSettle();

      expect(source.submitted.single.toJson(), {
        'kind': 'priority.set',
        'payload': {
          'projectKey': 'platform',
          'targetKey': 'lane-alpha',
          'priority': 'high',
        },
      });
      expect(find.byType(FleetAccessPage), findsOneWidget);
      expect(find.text('Waiting for approval'), findsOneWidget);
      expect(find.text('Request sent'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    testWidgets('a refusal stays on the form with its reason', (tester) async {
      source.submitAnswers
        ..clear()
        ..add(fleetApiError(429, 'questions_per_hour'));
      await openForm(tester);
      await choose(tester, 'topic', 'Timeline');
      await tester.tap(find.byKey(const ValueKey('fleet-access-submit')));
      await tester.pumpAndSettle();
      expect(source.submitted.single.topic, FleetTopic.timeline);
      expect(
        find.text('Request limit reached. Try again later'),
        findsOneWidget,
      );
      expect(find.byType(FleetAccessPage), findsNothing);
    });
  });

  group('link chat identity', () {
    Future<void> openLink(WidgetTester tester) => pump(
      tester,
      FleetAccessPage(initialView: FleetAccessView.link, now: now),
    );

    testWidgets('code, preview with channel and account, then confirm', (
      tester,
    ) async {
      await openLink(tester);
      await tester.tap(find.byKey(const ValueKey('fleet-access-link-start')));
      await tester.pumpAndSettle();
      expect(find.text(linkCode), findsOneWidget);
      expect(find.text('Expires in 10:00'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('fleet-access-link-check')));
      await tester.pumpAndSettle();
      expect(find.text('Paste the ID exactly as Mira sent it'), findsOneWidget);
      expect(source.confirmCalls, isEmpty);

      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-link-id')),
        linkId,
      );
      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-link-confirmation')),
        confirmationCode,
      );
      await tester.tap(find.byKey(const ValueKey('fleet-access-link-check')));
      await tester.pumpAndSettle();
      expect(find.text('Zalo'), findsOneWidget);
      expect(find.text('Mira Zalo'), findsOneWidget);
      expect(source.confirmCalls.single.preview, isTrue);

      await tester.tap(find.byKey(const ValueKey('fleet-access-link-confirm')));
      await tester.pumpAndSettle();
      expect(find.text('Linked to Mira Zalo on Zalo'), findsOneWidget);
      expect(source.confirmCalls.last.preview, isFalse);
    });

    testWidgets('an expired code offers a new one', (tester) async {
      var current = fleetAccessTestNow;
      await pump(
        tester,
        FleetAccessPage(initialView: FleetAccessView.link, now: () => current),
      );
      await tester.tap(find.byKey(const ValueKey('fleet-access-link-start')));
      await tester.pumpAndSettle();
      current = current.add(const Duration(minutes: 10));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Code expired'), findsOneWidget);
      expect(find.text(linkCode), findsNothing);
      expect(
        find.byKey(const ValueKey('fleet-access-link-new-code')),
        findsOneWidget,
      );
    });

    testWidgets('a wrong confirmation shows its reason', (tester) async {
      source.confirmAnswers.add(fleetApiError(403, 'invalid_confirmation'));
      await openLink(tester);
      await tester.tap(find.byKey(const ValueKey('fleet-access-link-start')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-link-id')),
        linkId,
      );
      await tester.enterText(
        find.byKey(const ValueKey('fleet-access-link-confirmation')),
        confirmationCode,
      );
      await tester.tap(find.byKey(const ValueKey('fleet-access-link-check')));
      await tester.pumpAndSettle();
      expect(
        find.text('The link ID or code is wrong or expired'),
        findsOneWidget,
      );
      expect(access.state.visible, isTrue);
    });
  });
}
