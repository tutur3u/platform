import 'package:flutter/rendering.dart';
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
  prepare: _alignToLineGap,
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
    // The iPad's conversation ends well above its composer, which sits below
    // the visible card; the composer crops the card after the last message.
    // The Play tablet shows its composer and dock, so it keeps the full card.
    if (currentStoreDevice?.id == 'ios/ipad-13')
      ...storeContentAnchor(tester, _turns().last),
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

/// The transcript's scroll view.
Finder _transcript() =>
    find.ancestor(of: _turns().first, matching: find.byType(Scrollable)).first;

/// The y of the first row of pixels the transcript shows. The page's header
/// floats over the top of the scroll view, so the first row the view wins a
/// hit test at is the first one in sight.
double _visibleTop(WidgetTester tester) {
  final view = tester.renderObject<RenderObject>(_transcript());
  final rect = tester.getRect(_transcript());
  for (var y = rect.top; y < rect.top + 200; y++) {
    final hit = tester.hitTestOnBinding(Offset(rect.center.dx, y));
    for (final entry in hit.path) {
      final target = entry.target;
      if (target is RenderObject && _within(target, view)) return y;
    }
  }
  return rect.top;
}

bool _within(RenderObject node, RenderObject ancestor) {
  for (RenderObject? it = node; it != null; it = it.parent) {
    if (identical(it, ancestor)) return true;
  }
  return false;
}

/// The global top and bottom of the glyphs of every line of text in the
/// transcript.
List<(double, double)> _textLines(WidgetTester tester) {
  final lines = <(double, double)>[];
  final texts = find.descendant(
    of: _transcript(),
    matching: find.byType(RichText),
  );
  for (final element in texts.evaluate()) {
    final paragraph = element.renderObject;
    if (paragraph is! RenderParagraph) continue;
    final boxes = paragraph.getBoxesForSelection(
      TextSelection(
        baseOffset: 0,
        extentOffset: paragraph.text.toPlainText().length,
      ),
    );
    for (final box in boxes) {
      // The glyphs fill the middle of a line box; its leading above and below
      // may sit under the header.
      final top = paragraph.localToGlobal(Offset(0, box.top)).dy;
      final bottom = paragraph.localToGlobal(Offset(0, box.bottom)).dy;
      final leading = (bottom - top) * 0.15;
      lines.add((top + leading, bottom - leading));
    }
  }
  return lines;
}

bool _cutsALine(List<(double, double)> lines, double y) =>
    lines.any((line) => line.$1 < y - 0.5 && line.$2 > y + 0.5);

/// The distance to scroll the pinned list up, within the 24 px the page
/// tolerates before it shows its "jump to latest" button, so that the visible
/// top falls between two lines of text; 0 when it already does, null when no
/// distance within 24 px does.
double? _scrollUpToLineGap(WidgetTester tester) {
  if (_turns().evaluate().isEmpty) return 0;
  final top = _visibleTop(tester);
  final lines = _textLines(tester);
  for (var up = 0.0; up <= 24; up += 0.5) {
    if (!_cutsALine(lines, top - up)) return up;
  }
  return null;
}

/// Starts the viewport between lines of text. The page pins the conversation
/// to the bottom, so the view begins wherever the content overflows, often
/// through a line. The list scrolls up the few pixels that reach a gap between
/// lines, which stays within the distance the page tolerates before it shows
/// its "jump to latest" button, and fails when no such gap exists.
Future<void> _alignToLineGap(WidgetTester tester, StoreLocale locale) async {
  final up = _scrollUpToLineGap(tester);
  expect(
    up,
    isNotNull,
    reason: 'no gap between lines of Mira text to start at',
  );
  if (up == 0) return;
  // The page pins the list to the bottom until the reader drags away from it,
  // and a drag that ends near the bottom pins it again. Drag well clear of the
  // bottom to let go of the pin, then jump back to the line gap. The jump
  // leaves the pin released, and the page shows its button only more than 24 px
  // from the bottom, which this never is.
  await tester.drag(_transcript(), const Offset(0, 80));
  await settleStoreScreen(tester);
  final position = tester.state<ScrollableState>(_transcript()).position;
  position.jumpTo(position.maxScrollExtent - up!);
  await tester.pump(const Duration(milliseconds: 300));
  expect(
    _cutsALine(_textLines(tester), _visibleTop(tester)),
    isFalse,
    reason: 'a line of Mira text is cut',
  );
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
