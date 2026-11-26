import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_origins.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/platform/watch_companion_service.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockSupabaseClient extends Mock implements SupabaseClient {}

class _MockGoTrueClient extends Mock implements GoTrueClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('mobile/watch_companion');
  late _MockSupabaseClient supabaseClient;
  late _MockGoTrueClient goTrue;
  late List<MethodCall> outgoingCalls;

  setUp(() {
    supabaseClient = _MockSupabaseClient();
    goTrue = _MockGoTrueClient();
    outgoingCalls = <MethodCall>[];
    when(() => supabaseClient.auth).thenReturn(goTrue);

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          outgoingCalls.add(call);
          return true;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Session makeSession({required String token}) {
    const user = User(
      id: 'user-1',
      appMetadata: {},
      userMetadata: {'display_name': 'Linh Tran'},
      aud: 'authenticated',
      createdAt: '2026-01-01T00:00:00Z',
    );
    return Session(
      accessToken: token,
      tokenType: 'bearer',
      user: user,
      expiresIn: 3600,
    );
  }

  test(
    'syncAuthenticatedState pushes token, workspace, and calendar gateway',
    () async {
      final session = makeSession(token: 'jwt-prod-1');
      when(() => goTrue.currentSession).thenReturn(session);
      when(() => goTrue.currentUser).thenReturn(session.user);

      final prodOrigins = ApiOrigins.forFlavor(AppFlavor.production);
      final service = WatchCompanionService(
        channel: channel,
        isIOSOverride: true,
        authClient: supabaseClient,
        originPathResolver: prodOrigins.baseUrlForPath,
      );

      await service.syncAuthenticatedState(
        workspace: const Workspace(id: 'ws-1', name: 'Tuturuuu'),
        localeCode: 'vi_VN',
        calmColors: true,
        defaultListId: 'list-42',
      );

      expect(outgoingCalls, hasLength(1));
      expect(outgoingCalls.single.method, 'syncContext');
      final decoded =
          jsonDecode(outgoingCalls.single.arguments as String)
              as Map<String, dynamic>;
      expect(decoded['signedOut'], false);
      expect(decoded['accessToken'], 'jwt-prod-1');

      final metadata = decoded['metadata'] as Map<String, dynamic>;
      expect(metadata['userId'], 'user-1');
      expect(metadata['userFirstName'], 'Linh');
      expect(metadata['workspaceId'], 'ws-1');
      expect(metadata['workspaceName'], 'Tuturuuu');
      expect(metadata['isPersonal'], false);
      expect(metadata['defaultListId'], 'list-42');
      expect(metadata['locale'], 'vi');
      expect(metadata['calmColors'], true);

      final origins = metadata['apiOrigins'] as Map<String, dynamic>;
      expect(origins['platform'], 'https://tuturuuu.com');
      expect(origins['tasks'], 'https://tasks.tuturuuu.com');
      expect(
        origins['calendarBase'],
        'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar',
      );
    },
  );

  test('clearSession sends signedOut wipe payload', () async {
    final service = WatchCompanionService(
      channel: channel,
      isIOSOverride: true,
      authClient: supabaseClient,
    );

    await service.clearSession();

    expect(outgoingCalls, hasLength(1));
    final decoded =
        jsonDecode(outgoingCalls.single.arguments as String)
            as Map<String, dynamic>;
    expect(decoded, {'signedOut': true});
  });

  test('is a no-op on non-iOS platforms', () async {
    final service = WatchCompanionService(
      channel: channel,
      isIOSOverride: false,
      authClient: supabaseClient,
    );
    await service.clearSession();
    expect(outgoingCalls, isEmpty);
  });

  test('responds to native refreshSession with refreshed token', () async {
    final stale = makeSession(token: 'jwt-old');
    final fresh = makeSession(token: 'jwt-fresh');
    when(() => goTrue.currentSession).thenReturn(stale);
    when(() => goTrue.currentUser).thenReturn(fresh.user);
    when(
      () => goTrue.refreshSession(),
    ).thenAnswer((_) async => AuthResponse(session: fresh, user: fresh.user));

    final devOrigins = ApiOrigins.forFlavor(AppFlavor.development);
    final service = WatchCompanionService(
      channel: channel,
      isIOSOverride: true,
      authClient: supabaseClient,
      originPathResolver: devOrigins.baseUrlForPath,
    )..attach();
    addTearDown(service.dispose);

    await service.syncAuthenticatedState(
      workspace: const Workspace(
        id: 'ws-dev',
        name: 'Personal',
        personal: true,
      ),
      localeCode: 'en',
    );

    final replyBytes = await TestDefaultBinaryMessengerBinding
        .instance
        .defaultBinaryMessenger
        .handlePlatformMessage(
          channel.name,
          const StandardMethodCodec().encodeMethodCall(
            const MethodCall('refreshSession'),
          ),
          (_) {},
        );
    expect(replyBytes, isNotNull);
    final rawJson =
        const StandardMethodCodec().decodeEnvelope(replyBytes!) as String;
    final decoded = jsonDecode(rawJson) as Map<String, dynamic>;
    expect(decoded['signedOut'], false);
    expect(decoded['accessToken'], 'jwt-fresh');
    final origins =
        (decoded['metadata'] as Map<String, dynamic>)['apiOrigins']
            as Map<String, dynamic>;
    expect(origins['calendarBase'], 'http://localhost:7806');
  });
}
