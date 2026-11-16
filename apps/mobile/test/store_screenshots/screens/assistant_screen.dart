import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/assistant/view/background_reply_harness.dart';
import '../fixtures/assistant_fixture.dart';
import '../fixtures/shell_frame_fixture.dart';
import '../store_screenshot_app.dart';

/// Mira, the workspace assistant: Linh asks what is urgent today and Mira
/// answers with a short list, proposes one action and confirms it.
const StoreScreen assistantStoreScreen = StoreScreen(
  id: 'assistant',
  order: 4,
  build: _build,
  prepare: _openToolSteps,
);

/// Opens each turn's tool steps so the listing shows what Mira looked up
/// and what it changed. Shorter screens keep them folded so the whole
/// conversation, Linh's question included, stays in frame.
Future<void> _openToolSteps(WidgetTester tester, StoreLocale locale) async {
  final view = tester.view.physicalSize / tester.view.devicePixelRatio;
  final roomy = view.height >= 950 || (view.height >= 900 && view.width >= 700);
  if (!roomy) return;
  final toggles = find.byKey(const ValueKey('assistant-tools-toggle'));
  for (var i = 0; i < toggles.evaluate().length; i++) {
    await tester.tap(toggles.at(i), warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
  }
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
