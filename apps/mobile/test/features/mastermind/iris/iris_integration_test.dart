import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/iris/view/iris_chat_view.dart';
import 'package:mobile/features/mastermind/iris/view/iris_devices_page.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/mastermind_iris_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

Uint8List _bytes(String json) => Uint8List.fromList(utf8.encode(json));

void main() {
  tearDown(() {
    debugOverrideMastermindIris(enabled: null);
    mastermindIrisCapability.value = false;
  });

  group('capabilities', () {
    test('a Worker without iris is off', () {
      final caps = MastermindCapabilities.parse(
        _bytes('{"schema_versions":["1.4"],"replies":true,"push":false}'),
      )!;
      expect(caps.iris, isFalse);
    });

    test('reads the fixed last iris key', () {
      final caps = MastermindCapabilities.parse(
        _bytes(
          '{"schema_versions":["1.4"],"replies":true,"push":false,'
          '"iris":true}',
        ),
      )!;
      expect(caps.iris, isTrue);
      expect(caps.replies, isTrue);
    });

    test('a drifting iris key fails closed', () {
      const base = '{"schema_versions":["1.4"],"replies":true,"push":false';
      for (final body in [
        '$base,"iris":1}',
        '$base,"iris":true,"extra":true}',
      ]) {
        expect(MastermindCapabilities.parse(_bytes(body)), isNull);
      }
    });
  });

  group('flag and segments', () {
    test('off: no Chat, Needs you is the default', () {
      debugOverrideMastermindIris(enabled: false);
      expect(availableInboxSegments, isNot(contains(InboxSegment.chat)));
      expect(inboxSegmentFromQuery(null), InboxSegment.needsYou);
      expect(inboxSegmentFromQuery('chat'), InboxSegment.needsYou);
      expect(inboxLocation(), '/mastermind/inbox');
    });

    test('on: Chat is first and the default; Needs you is explicit', () {
      debugOverrideMastermindIris(enabled: true);
      expect(availableInboxSegments.first, InboxSegment.chat);
      expect(inboxSegmentFromQuery(null), InboxSegment.chat);
      expect(inboxLocation(), '/mastermind/inbox?segment=needs-you');
      expect(inboxLocation(segment: InboxSegment.chat), '/mastermind/inbox');
    });

    test('the hub capability turns it on without a define', () {
      expect(mastermindIrisEnabled, isFalse);
      mastermindIrisCapability.value = true;
      expect(mastermindIrisEnabled, isTrue);
    });
  });

  testWidgets('with Iris on, the Inbox opens on Chat with What needs me', (
    tester,
  ) async {
    debugOverrideMastermindIris(enabled: true);
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 1400);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    final harness = MastermindViewHarness(
      source: FakeHubSource(
        bytes: snapshotBytes(
          inboxJson([
            {...inboxItem(1), 'urgency': 'urgent'},
          ], security: false),
        ),
      ),
      iris: irisFixtureRelay(),
    );
    addTearDown(harness.dispose);
    await harness.setAccess(TestAccess.enabled);
    await tester.pumpApp(
      harness.wrap(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const MastermindInboxPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.pump();
    expect(find.byType(IrisChatView), findsOneWidget);
    // Scroll to the top of the history, where the header sits.
    // The list is reversed: scrolling toward its end reaches the oldest.
    await tester.scrollUntilVisible(
      find.text('What needs me'),
      500,
      scrollable: find
          .descendant(
            of: find.byType(IrisChatView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('Chat'), findsOneWidget);
    expect(find.text('1 urgent'), findsOneWidget);
    expect(find.textContaining('Atlas: running'), findsOneWidget);
    expect(find.text('Sample pool 60% · resets 14:00'), findsOneWidget);

    await tester.tap(find.text('Needs you'));
    await tester.pumpAndSettle();
    expect(find.byType(IrisChatView), findsNothing);
    expect(find.text('Choose a plan'), findsOneWidget);
  });

  testWidgets('enrolment shows the code and key prefix, then confirms', (
    tester,
  ) async {
    final relay = irisFixtureRelay();
    await tester.pumpApp(
      IrisDevicesPage(relay: relay, identity: const FakeIrisDeviceIdentity()),
    );
    await tester.pump();
    expect(find.text('No devices enrolled yet'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('iris-enrol-start')));
    await tester.pump();
    await tester.pump();
    final code = tester.widget<SelectableText>(
      find.byKey(const ValueKey('iris-enrol-code')),
    );
    expect(code.data, matches(RegExp(r'^\d{6}$')));
    expect(
      find.textContaining(
        'Open the Iris enrol page and confirm with your '
        'passkey',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Waiting for you to confirm'), findsOneWidget);
    expect(find.byKey(const ValueKey('iris-enrol-start')), findsNothing);

    final device = (await relay.devices()).valueOrNull!.single;
    relay.confirmDevice(device.id);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    await tester.pump();
    expect(find.text('This device is enrolled.'), findsOneWidget);
    expect(find.text('Enrolled'), findsOneWidget);

    // Revoking takes a second tap on the same button, never a dialog.
    final revoke = find.byKey(ValueKey('iris-revoke-${device.id}'));
    await tester.tap(revoke);
    await tester.pump();
    expect(find.text('Tap again to revoke'), findsOneWidget);
    await tester.tap(revoke);
    await tester.pump();
    await tester.pump();
    expect(find.text('Revoked'), findsOneWidget);
  });

  testWidgets('a build without a device key cannot enrol', (tester) async {
    await tester.pumpApp(IrisDevicesPage(relay: irisFixtureRelay()));
    await tester.pump();
    expect(find.byKey(const ValueKey('iris-enrol-start')), findsNothing);
    expect(
      find.text("This build can't create a device key yet."),
      findsOneWidget,
    );
  });
}
