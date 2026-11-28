import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_screen_service.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';

import 'consent/mira_ai_consent_fakes.dart';
import 'live_dispatch_transport.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Screen extends Mock implements AssistantLiveScreenService {}

const _envelope = AssistantLiveTokenEnvelope(
  token: 'synthetic-token',
  chatId: 'chat',
  scopeKey: 'scope',
  sessionHandle: null,
  model: 'model',
  seedHistory: [],
);

const _consentRefusal = ApiException(
  message: 'ai_consent_required',
  statusCode: 403,
  code: 'ai_consent_required',
);

void main() {
  late _Repository repository;
  late FakeMiraAiConsentGate gate;
  late AssistantLiveCubit cubit;
  late int tokenCalls;
  Object? tokenFailure;

  setUp(() {
    repository = _Repository();
    gate = FakeMiraAiConsentGate();
    tokenCalls = 0;
    tokenFailure = null;
    final player = _Player();
    final recorder = _Recorder();
    final camera = _Camera();
    final screen = _Screen();
    final wire = LiveDispatchTransport()..autoReady = true;
    when(player.initialize).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    when(() => screen.isSupported).thenReturn(true);
    when(() => screen.requiresMicrophone).thenReturn(false);
    when(screen.stop).thenAnswer((_) async {});
    when(
      () => repository.fetchLiveToken(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((_) async {
      tokenCalls++;
      if (tokenFailure case final failure?) throw failure;
      return _envelope;
    });
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: wire.socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      screenService: screen,
      currentUserId: () => consentActor,
      currentScopeToken: () => 0,
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
      aiConsentGate: gate,
    );
    addTearDown(cubit.close);
  });

  test('Live without consent never requests a token', () async {
    final started = await cubit.prepareSession(wsId: 'ws');

    expect(started, isNull);
    expect(gate.requests, 1);
    expect(tokenCalls, 0);
    expect(cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(cubit.state.error, AssistantLiveFailure.aiConsentRequired);
  });

  test('Live starts once the user allows', () async {
    gate.allow = true;
    await cubit.prepareSession(wsId: 'ws');

    expect(gate.requests, 1);
    expect(tokenCalls, 1);
  });

  test('a token consent refusal forgets the grant', () async {
    gate.granted = true;
    tokenFailure = _consentRefusal;
    await cubit.prepareSession(wsId: 'ws');

    expect(tokenCalls, 1);
    expect(gate.refusals, 1);
    expect(gate.granted, isFalse);
    expect(cubit.state.error, AssistantLiveFailure.aiConsentRequired);
  });

  test('a consent eligibility refusal asks instead of locking', () {
    final eligibility = AssistantLiveEligibility.fromJson(const {
      'eligible': false,
      'reason': 'ai_consent_required',
    });
    expect(eligibility.consentRequired, isTrue);
    expect(eligibility.blocked, isFalse);
    expect(
      AssistantLiveEligibility.fromTokenFailure(_consentRefusal)?.reason,
      AssistantLiveBlockReason.aiConsentRequired,
    );
  });
}
