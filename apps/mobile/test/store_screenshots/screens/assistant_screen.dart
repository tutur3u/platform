import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/assistant/view/background_reply_harness.dart';
import '../fixtures/assistant_fixture.dart';
import '../fixtures/shell_frame_fixture.dart';
import '../store_screenshot_app.dart';

/// Mira, the workspace assistant: Linh asks what is urgent today and Mira
/// answers with a short list, proposes one action and confirms it.
const StoreScreen assistantStoreScreen = StoreScreen(
  id: 'assistant',
  order: 2,
  build: _build,
  prepare: _openToolSteps,
  anchors: _anchors,
);

/// The last tool card (Mira's calendar update): its "Done" pill and its
/// Details button, for the composer's "Calendar updated" chip.
Map<String, Rect> _anchors(WidgetTester tester) {
  final l10n = tester.element(find.byType(AssistantPage)).l10n;
  final done = find.text(l10n.assistantToolStepDone);
  final details = find.byWidgetPredicate(
    (widget) =>
        widget is Text &&
        (widget.data == l10n.assistantToolStepDetails ||
            widget.data == l10n.assistantToolStepHideDetails),
  );
  if (done.evaluate().isEmpty || details.evaluate().isEmpty) return const {};
  return {
    'done': tester.getRect(done.last),
    'details': tester.getRect(details.last),
  };
}

/// Each turn of the conversation: the padded row the transcript keys by
/// `('assistant-turn', ...)`.
Finder _turns() => find.byWidgetPredicate((widget) {
  final key = widget.key;
  if (key is! ValueKey) return false;
  final value = key.value;
  return value is (Object?, Object?, Object?, Object?) &&
      value.$1 == 'assistant-turn';
});

/// How far the turn under the header sticks out above the viewport, or 0 when
/// the viewport starts at a turn's top. The turns end in a 14 px gap, which
/// counts as clear.
double _cutAtTop(WidgetTester tester) {
  final turns = _turns();
  if (turns.evaluate().isEmpty) return 0;
  final viewTop = tester
      .getTopLeft(
        find.ancestor(of: turns.first, matching: find.byType(Scrollable)).first,
      )
      .dy;
  var cut = 0.0;
  for (final element in turns.evaluate()) {
    final rect = tester.getRect(find.byWidget(element.widget));
    if (rect.top < viewTop - 0.5 && rect.bottom - 14 > viewTop + 0.5) {
      cut = cut < viewTop - rect.top ? viewTop - rect.top : cut;
    }
  }
  return cut;
}

Future<void> _toggleToolSteps(WidgetTester tester) async {
  final toggles = find.byKey(const ValueKey('assistant-tools-toggle'));
  for (var i = 0; i < toggles.evaluate().length; i++) {
    await tester.tap(toggles.at(i), warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
  }
  await settleStoreScreen(tester);
}

/// Shows what Mira looked up and changed by opening each turn's tool steps,
/// then makes the viewport start at the top of a whole message, never in the
/// middle of one. When open steps push the first turn under the header, the
/// steps fold again; when the folded conversation still overflows, the list
/// scrolls up to the top of the turn that was cut.
Future<void> _openToolSteps(WidgetTester tester, StoreLocale locale) async {
  final view = tester.view.physicalSize / tester.view.devicePixelRatio;
  final roomy = view.height >= 950 || (view.height >= 900 && view.width >= 700);
  if (roomy) {
    await _toggleToolSteps(tester);
    if (_cutAtTop(tester) > 0) await _toggleToolSteps(tester);
  }
  final cut = _cutAtTop(tester);
  if (cut <= 0) return;
  final turns = _turns();
  final scrollable = tester.state<ScrollableState>(
    find.ancestor(of: turns.first, matching: find.byType(Scrollable)).first,
  );
  scrollable.position.jumpTo(scrollable.position.pixels - cut);
  await tester.pump(const Duration(milliseconds: 300));
}

Widget _build(StoreLocale locale) {
  SharedPreferences.setMockInitialValues({});
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.record/messages'),
        (call) async => null,
      );
  final auth = ReplyAuth();
  final page = AssistantPage(
    repository: StoreAssistantRepository(locale),
    preferences: StoreAssistantPreferences(),
    currentActor: () => auth.state.user?.id,
  );
  return storeShellFrame(
    location: Routes.assistant,
    auth: auth,
    assistantPageBuilder: (_) => page,
    child: page,
  );
}
