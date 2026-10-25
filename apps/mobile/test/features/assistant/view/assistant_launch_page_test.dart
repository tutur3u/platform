import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_action.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_coordinator.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';

import 'background_reply_harness.dart';
import 'compact_model_header_harness.dart';

const _actor = '33333333-3333-4333-8333-333333333333';

class _LiveRepository extends ReplyRepository {
  _LiveRepository({required this.live});
  final bool live;
  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => AssistantCredits(
    remaining: 1000,
    allowedFeatures: live ? const ['live_assistant'] : const [],
  );
}

void main() {
  final coordinator = AssistantLaunchCoordinator.instance;
  final host = AssistantLaunchHost(
    currentActor: () => _actor,
    appLocked: () => false,
    workspace: () => AssistantLaunchWorkspace.ready,
    openAssistant: () {},
    openWorkspacePicker: () {},
  );
  var ids = 0;

  setUp(
    () => coordinator
      ..resetForTest()
      ..bind(host),
  );
  tearDown(coordinator.resetForTest);

  AssistantLaunchAction action(
    AssistantLaunchKind kind, {
    bool trusted = false,
    String? prompt,
  }) => AssistantLaunchAction(
    id: 'launch-${++ids}',
    kind: kind,
    trusted: trusted,
    createdAt: DateTime.now(),
    prompt: prompt,
  );

  Future<CompactModelHeaderHarness> mount(
    WidgetTester tester, {
    bool live = true,
  }) async {
    final h = CompactModelHeaderHarness(
      repository: _LiveRepository(live: live),
    );
    addTearDown(() => h.dispose(tester));
    await h.mount(tester, textScale: 1);
    return h;
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pumpAndSettle();
  }

  testWidgets('untrusted voice asks before opening the microphone', (
    tester,
  ) async {
    final h = await mount(tester);
    coordinator.submit(action(AssistantLaunchKind.voice));
    await settle(tester);

    expect(find.text('Start voice chat with Mira?'), findsOneWidget);
    expect(h.chrome.state.isLiveMode, isFalse);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(coordinator.request.value, isNull);
  });

  testWidgets('voice without Live access explains instead of failing', (
    tester,
  ) async {
    await mount(tester, live: false);
    coordinator.submit(action(AssistantLaunchKind.voice, trusted: true));
    await settle(tester);
    expect(find.byType(AssistantLiveInfoSheetBody), findsOneWidget);
  });

  testWidgets('untrusted prompt only prefills the composer', (tester) async {
    final h = await mount(tester);
    coordinator.submit(
      action(AssistantLaunchKind.prompt, prompt: 'Summarise my week'),
    );
    await settle(tester);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is EditableText &&
            widget.controller.text == 'Summarise my week',
      ),
      findsOneWidget,
    );
    expect(h.repository.starts, 0);
  });

  testWidgets('a request bound to another actor is discarded', (tester) async {
    final h = await mount(tester);
    coordinator
      ..unbind(host)
      ..bind(
        AssistantLaunchHost(
          currentActor: () => 'other-actor',
          appLocked: () => false,
          workspace: () => AssistantLaunchWorkspace.ready,
          openAssistant: () {},
          openWorkspacePicker: () {},
        ),
      )
      ..submit(action(AssistantLaunchKind.voice));
    await settle(tester);
    expect(find.text('Start voice chat with Mira?'), findsNothing);
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(coordinator.request.value, isNull);
  });
}
