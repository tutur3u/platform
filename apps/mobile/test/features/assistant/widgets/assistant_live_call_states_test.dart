import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_ended_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> _noop() async {}

const _actions = AssistantLiveCallActions(
  toggleMicrophone: _noop,
  toggleCamera: _noop,
  openKeyboard: _noop,
  end: _noop,
  callAgain: _noop,
  minimize: _noop,
);

Widget _app(AssistantLiveState state) => MaterialApp(
  locale: const Locale('en'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MediaQuery(
    data: const MediaQueryData(size: Size(390, 844)),
    child: Scaffold(
      body: AssistantLiveCallView(
        state: state,
        assistantName: 'Mira',
        actions: _actions,
      ),
    ),
  ),
);

AssistantLiveOrbMode _orbMode(WidgetTester tester) => tester
    .widget<AssistantLivePlaybackBlob>(find.byType(AssistantLivePlaybackBlob))
    .effectiveMode;

void main() {
  final l10n = AppLocalizationsEn();

  testWidgets('a paused Live mint explains itself instead of "Couldn\'t '
      'connect" alone', (tester) async {
    await tester.pumpWidget(
      _app(
        const AssistantLiveState(
          status: AssistantLiveConnectionStatus.error,
          error: AssistantLiveFailure.paused,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text(l10n.assistantLiveCallFailed), findsOneWidget);
    expect(find.text(l10n.assistantLiveFailurePaused), findsOneWidget);
    expect(_orbMode(tester), AssistantLiveOrbMode.failed);
    expect(
      find.byKey(const ValueKey('assistant-live-call-again')),
      findsOneWidget,
    );
  });

  testWidgets('a blocked microphone offers Settings instead of Retry', (
    tester,
  ) async {
    var opened = 0;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveCallEndedActions(
            failed: true,
            error: AssistantLiveFailure.microphonePermission,
            onCallAgain: _noop,
            onClose: _noop,
            openSettings: () async {
              opened++;
              return true;
            },
          ),
        ),
      ),
    );
    expect(
      find.byKey(const ValueKey('assistant-live-call-again')),
      findsNothing,
    );
    await tester.tap(
      find.byKey(const ValueKey('assistant-live-call-settings')),
    );
    expect(opened, 1);
  });

  testWidgets('connected calls show listening and speaking states', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        AssistantLiveState(
          status: AssistantLiveConnectionStatus.connected,
          isMicrophoneActive: true,
          callStartedAt: DateTime.now(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text(l10n.assistantLiveCallListening), findsOneWidget);
    expect(_orbMode(tester), AssistantLiveOrbMode.listening);

    await tester.pumpWidget(
      _app(
        AssistantLiveState(
          status: AssistantLiveConnectionStatus.connected,
          isMicrophoneActive: true,
          isAssistantSpeaking: true,
          callStartedAt: DateTime.now(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text(l10n.assistantLiveCallSpeaking), findsOneWidget);
    expect(_orbMode(tester), AssistantLiveOrbMode.speaking);
  });

  testWidgets('connecting keeps the orb swirling', (tester) async {
    await tester.pumpWidget(
      _app(
        const AssistantLiveState(
          status: AssistantLiveConnectionStatus.connecting,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(_orbMode(tester), AssistantLiveOrbMode.connecting);
    expect(tester.binding.hasScheduledFrame, isTrue);
  });
}
