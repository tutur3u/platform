import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/meet/data/meet_personal_chat.dart';
import 'package:mobile/features/meet/view/meet_ai_consent_gate.dart';
import 'package:mobile/features/meet/view/meet_personal_chat_panel.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../assistant/consent/mira_ai_consent_fakes.dart';

const ValueKey<String> _sheet = ValueKey('mira-consent-sheet');
const ValueKey<String> _input = ValueKey('meet-assistant-input');
const ValueKey<String> _send = ValueKey('meet-assistant-send');

/// Answers private Mira questions, or refuses them the way the server does
/// without AI data consent.
class _Repository extends MeetRepository {
  final questions = <String>[];
  bool refuseConsent = false;

  @override
  Future<String> askPersonalMira(
    String wsId,
    String meetingId, {
    required String requestId,
    required int startedAt,
    required String question,
    required String timezone,
    required List<Map<String, dynamic>> history,
  }) async {
    questions.add(question);
    if (refuseConsent) throw const MeetAiConsentRequiredException();
    return 'Private answer';
  }
}

/// The room page's wiring: the gate comes from the provided consent.
class _Room extends StatefulWidget {
  const _Room({required this.chat});

  final MeetPersonalChat chat;

  @override
  State<_Room> createState() => _RoomState();
}

class _RoomState extends State<_Room> {
  @override
  void initState() {
    super.initState();
    widget.chat.aiConsentGate = meetAiConsentGate(this);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: MeetPersonalChatPanel(chat: widget.chat, share: (_) async {}),
  );
}

void main() {
  late FakeMiraAiConsentRepository consent;
  late MiraAiConsentController controller;
  late _Repository repository;
  late MeetPersonalChat chat;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    consent = FakeMiraAiConsentRepository();
    controller = fakeConsentController(consent);
    repository = _Repository();
    chat = MeetPersonalChat(
      workspaceId: 'workspace',
      meetingId: 'meeting',
      repository: repository,
      timezoneLoader: () async => 'UTC',
    );
  });

  tearDown(() {
    chat.dispose();
    controller.dispose();
    repository.dispose();
  });

  Future<void> pumpRoom(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(1170, 2532)
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      RepositoryProvider.value(
        value: MiraAiConsentProvision(controller),
        child: _Room(chat: chat),
      ),
    );
    await tester.pumpAndSettle();
  }

  String draft(WidgetTester tester) =>
      tester.widget<TextField>(find.byKey(_input)).controller!.text;

  Future<void> ask(WidgetTester tester, String question) async {
    await tester.enterText(find.byKey(_input), question);
    await tester.tap(find.byKey(_send));
    await tester.pumpAndSettle();
  }

  testWidgets('without consent the sheet opens and Not now sends nothing', (
    tester,
  ) async {
    await pumpRoom(tester);
    await ask(tester, 'What did we decide?');

    expect(find.byKey(_sheet), findsOneWidget);
    expect(repository.questions, isEmpty);

    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(find.byKey(_sheet), findsNothing);
    expect(repository.questions, isEmpty);
    expect(consent.saves, isEmpty);
    expect(draft(tester), 'What did we decide?');
    expect(chat.consentRequired, isTrue);
    expect(
      find.text('Allow sharing with Google Gemini to ask Mira.'),
      findsOneWidget,
    );
  });

  testWidgets('Allow stores consent, then sends the question', (tester) async {
    await pumpRoom(tester);
    await ask(tester, 'What did we decide?');
    await tester.tap(find.byKey(const ValueKey('mira-consent-allow')));
    await tester.pumpAndSettle();

    expect(consent.saves, [(granted: true, source: 'mobile_mira_prompt')]);
    expect(repository.questions, ['What did we decide?']);
    expect(find.byKey(_sheet), findsNothing);
    expect(draft(tester), isEmpty);
    expect(chat.turns.map((turn) => turn.body), [
      'What did we decide?',
      'Private answer',
    ]);
  });

  testWidgets('a held grant sends without asking', (tester) async {
    controller.debugSetConsent(
      consentActor,
      const MiraAiConsent(granted: true),
    );
    await pumpRoom(tester);
    await ask(tester, 'Summarize');

    expect(find.byKey(_sheet), findsNothing);
    expect(repository.questions, ['Summarize']);
  });

  testWidgets('a server consent refusal asks again and never re-sends', (
    tester,
  ) async {
    controller.debugSetConsent(
      consentActor,
      const MiraAiConsent(granted: true),
    );
    repository.refuseConsent = true;
    await pumpRoom(tester);
    await ask(tester, 'Summarize');

    expect(repository.questions, ['Summarize']);
    expect(controller.granted, isFalse);
    expect(chat.consentRequired, isTrue);
    expect(find.byKey(_sheet), findsOneWidget);
    expect(draft(tester), 'Summarize');

    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(repository.questions, ['Summarize'], reason: 'No automatic resend');
    expect(draft(tester), 'Summarize');
  });
}
