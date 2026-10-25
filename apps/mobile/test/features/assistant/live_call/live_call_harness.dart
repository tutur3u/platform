import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/pump_app.dart';

const List<LocalizationsDelegate<dynamic>> liveCallLocalizations =
    AppLocalizations.localizationsDelegates;

/// Records which call actions ran.
class LiveCallActionLog {
  final calls = <String>[];

  AssistantLiveCallActions get actions => AssistantLiveCallActions(
    toggleMicrophone: () async => calls.add('mic'),
    toggleCamera: () async => calls.add('camera'),
    openKeyboard: () async => calls.add('keyboard'),
    end: () async => calls.add('end'),
    callAgain: () async => calls.add('again'),
    minimize: () async => calls.add('minimize'),
  );
}

/// Named Live states for the call surface matrix.
Map<String, AssistantLiveState> liveCallStates(DateTime now) => {
  'connecting': const AssistantLiveState(
    status: AssistantLiveConnectionStatus.connecting,
  ),
  'connected': AssistantLiveState(
    status: AssistantLiveConnectionStatus.connected,
    isMicrophoneActive: true,
    isAssistantSpeaking: true,
    assistantAudioLevel: .6,
    assistantSpectrum: const [.5, .3, .7],
    callStartedAt: now.subtract(const Duration(minutes: 2, seconds: 5)),
    userTranscript: 'What is on my calendar tomorrow?',
    assistantTranscript: 'You have a design review at ten.',
  ),
  'muted': AssistantLiveState(
    status: AssistantLiveConnectionStatus.connected,
    callStartedAt: now.subtract(const Duration(hours: 1, seconds: 7)),
  ),
  'reconnecting': AssistantLiveState(
    status: AssistantLiveConnectionStatus.reconnecting,
    callStartedAt: now.subtract(const Duration(minutes: 4)),
  ),
  'ended': const AssistantLiveState(
    hasEnded: true,
    lastCallDuration: Duration(minutes: 3, seconds: 12),
  ),
};

/// The app's theme and appearance backdrop around one call view, so gradient
/// and blob themes render exactly as in the pushed route.
Widget liveCallApp({
  required AssistantLiveState state,
  required AssistantLiveCallActions actions,
  AppearanceSettings appearance = const AppearanceSettings(),
  Brightness brightness = Brightness.light,
  bool captionsOpen = false,
  Key? viewKey,
}) => appearanceTestApp(
  appearance: appearance,
  brightness: brightness,
  home: Material(
    type: MaterialType.transparency,
    child: AssistantLiveCallView(
      key: viewKey,
      state: state,
      assistantName: 'Mira',
      actions: actions,
      initialCaptionsOpen: captionsOpen,
    ),
  ),
);

void setLiveCallViewport(WidgetTester tester, ui.Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

/// Writes a PNG when MIRA_LIVE_CALL_RENDER_DIR is set; no-op otherwise.
Future<void> renderLiveCall(WidgetTester tester, String name) async {
  final directory = Platform.environment['MIRA_LIVE_CALL_RENDER_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    await Directory(directory).create(recursive: true);
    final scene = tester.binding.renderViews.first.debugLayer!.buildScene(
      ui.SceneBuilder(),
    );
    final size = tester.view.physicalSize;
    final image = await scene.toImage(size.width.toInt(), size.height.toInt());
    scene.dispose();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
