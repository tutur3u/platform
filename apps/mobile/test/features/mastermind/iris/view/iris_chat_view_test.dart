import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_send_cubit.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/view/iris_chat_view.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';

import '../../../../helpers/mastermind_iris_fixture.dart';
import '../../../../helpers/pump_app.dart';

/// Renders whatever the page publishes into the shell dock, under the page,
/// the way the floating dock would.
class _DockHost extends StatefulWidget {
  const _DockHost({required this.child});
  final Widget child;

  @override
  State<_DockHost> createState() => _DockHostState();
}

class _DockHostState extends State<_DockHost> {
  final _slots = ShellDockSlotController();

  @override
  void dispose() {
    _slots.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ShellDockScope(
    controller: _slots,
    child: Column(
      children: [
        Expanded(child: widget.child),
        ListenableBuilder(
          listenable: _slots,
          builder: (context, _) {
            final slot = _slots.slot;
            if (slot == null) return const SizedBox.shrink();
            return Row(
              children: [
                if (slot.composing) Expanded(child: slot.content),
                slot.primary,
              ],
            );
          },
        ),
      ],
    ),
  );
}

void main() {
  late IrisFixtureFaults faults;
  late FixtureIrisRelay relay;

  setUp(() {
    faults = IrisFixtureFaults();
    relay = irisFixtureRelay(faults: faults);
  });

  Future<void> pumpChat(
    WidgetTester tester, {
    ThemeMode? themeMode,
    IrisSendCubit? sendCubit,
  }) async {
    await tester.pumpApp(
      _DockHost(
        child: IrisChatView(relay: relay, sendCubit: sendCubit),
      ),
      themeMode: themeMode,
    );
    await tester.pump();
    await tester.pump();
  }

  Future<void> sendText(WidgetTester tester, String text) async {
    await tester.tap(find.byKey(const ValueKey('iris-composer-open')));
    // The dock slot publishes after layout.
    await tester.pump();
    await tester.pump();
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('iris-composer-field')),
        matching: find.byType(EditableText),
      ),
      text,
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('iris-composer-send')));
    await tester.pump();
  }

  testWidgets('opens at the newest message, newest last', (tester) async {
    await pumpChat(tester);
    final messages = irisFixtureJson()['messages'] as List;
    final newest = (messages.last as Map)['msg_ref'] as String;
    final older = (messages[messages.length - 2] as Map)['msg_ref'] as String;
    final newestBox = find.byKey(ValueKey('iris-message-$newest'));
    expect(newestBox, findsOneWidget);
    expect(
      tester.getTopLeft(newestBox).dy,
      greaterThan(
        tester.getTopLeft(find.byKey(ValueKey('iris-message-$older'))).dy,
      ),
    );
    expect(find.text('Load earlier messages'), findsNothing);
  });

  testWidgets('a withheld message reads as hidden, not a gap', (tester) async {
    await pumpChat(tester);
    await tester.scrollUntilVisible(find.text('Hidden message'), 300);
    expect(find.text('Hidden message'), findsOneWidget);
  });

  testWidgets('renders in dark mode', (tester) async {
    await pumpChat(tester, themeMode: ThemeMode.dark);
    expect(tester.takeException(), isNull);
    expect(find.byType(IrisChatView), findsOneWidget);
  });

  testWidgets('a send shows Sending, then Sent, then Seen', (tester) async {
    final send = IrisSendCubit(relay: relay);
    await pumpChat(tester, sendCubit: send);
    await sendText(tester, 'Ship the demo');
    await tester.pump();
    expect(find.text('Ship the demo'), findsOneWidget);
    expect(find.text('Sending'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.text('Sent'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(find.text('Seen'), findsOneWidget);
    await send.close();
  });

  testWidgets('a queued delivery reads Queued', (tester) async {
    faults.slowAck = true;
    await pumpChat(tester);
    await sendText(tester, 'Later is fine');
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.text('Queued'), findsOneWidget);
  });

  testWidgets('three failed attempts offer Retry with the same key', (
    tester,
  ) async {
    final send = IrisSendCubit(relay: relay);
    await pumpChat(tester, sendCubit: send);
    faults.offline = true;
    await sendText(tester, 'Are you there');
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(find.text('Not sent'), findsOneWidget);
    final key = send.state.single.idempotencyKey;
    expect(send.state.single.attempts, IrisSendCubit.maxAttempts);

    faults.offline = false;
    await tester.tap(find.text('Retry'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Sending'), findsOneWidget);
    expect(send.state.single.idempotencyKey, key);
    // An injected cubit outlives the page; close it before the timer check.
    await send.close();
  });

  testWidgets('the kill switch shows a banner and turns sending off', (
    tester,
  ) async {
    faults.killed = true;
    await pumpChat(tester);
    expect(find.byKey(const ValueKey('iris-killed-banner')), findsOneWidget);
    final open = tester.widget<IconButton>(
      find.byKey(const ValueKey('iris-composer-open')),
    );
    expect(open.onPressed, isNull);
  });
}
