import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_timezone');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late _Client client;
  late DateTime now;
  const user = User(
    id: 'synthetic-user',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  setUp(() {
    now = DateTime.utc(2026, 10);
    client = _Client();
    final auth = _Auth();
    final session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-token');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    messenger.setMockMethodCallHandler(
      channel,
      (_) async => {
        'identifier': 'Asia/Saigon',
        'localizedName': 'Indochina Time',
        'locale': 'en_US',
      },
    );
  });
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));
  test('actual gateway and native parsers respect cooldown '
      'across workspace changes', () async {
    var requests = 0;
    var blocked = true;
    final api = ApiClient(
      baseUrl: 'https://infra.test/api/v1/mobile-calendar',
      authClient: client,
      httpClient: MockClient((request) async {
        requests++;
        expect(request.headers['authorization'], 'Bearer synthetic-token');
        if (blocked) {
          return http.Response(
            '{"error":"Too Many Requests","message":"Rate limit exceeded"}',
            429,
            headers: {
              'retry-after': '30',
              'x-proxy-block-reason': 'route-rate-limit',
            },
          );
        }
        return http.Response('{"timezone":"auto"}', 200);
      }),
    );
    final repository = TimezoneSettingsRepository(apiClient: api);
    final cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: getVerifiedDeviceTimezoneIdentifier,
      clock: () => now,
    );
    await cubit.load(userId: user.id, workspaceId: 'workspace-a');
    expect(cubit.state.resolved, isFalse);
    expect(cubit.state.failed, isTrue);
    expect(cubit.state.retryAt, now.add(const Duration(seconds: 30)));
    final firstRequests = requests;
    await cubit.reload();
    await cubit.load(userId: user.id, workspaceId: 'workspace-b');
    expect(requests, firstRequests);
    now = now.add(const Duration(seconds: 30));
    blocked = false;
    await cubit.reload();
    expect(cubit.state.resolved, isTrue);
    expect(cubit.state.effective, 'Asia/Saigon');
    expect(cubit.state.retryAt, isNull);
    await cubit.close();
    repository.dispose();
    api.dispose();
  });
  test(
    'account switch clears old cooldown without retaining preferences',
    () async {
      var requests = 0;
      final api = ApiClient(
        baseUrl: 'https://infra.test',
        authClient: client,
        httpClient: MockClient((_) async {
          requests++;
          return http.Response('{}', 429, headers: {'retry-after': '30'});
        }),
      );
      final repository = TimezoneSettingsRepository(apiClient: api);
      final cubit = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: getVerifiedDeviceTimezoneIdentifier,
        clock: () => now,
      );
      await cubit.load(userId: 'account-a', workspaceId: null);
      await cubit.load(userId: 'account-b', workspaceId: null);
      expect(requests, 2);
      expect(cubit.state.resolved, isFalse);
      await cubit.close();
      repository.dispose();
      api.dispose();
    },
  );
  test('partial success stays visible without guessing '
      'effective timezone or enabling saves', () async {
    final api = ApiClient(
      baseUrl: 'https://infra.test',
      authClient: client,
      httpClient: MockClient(
        (request) async => request.url.path.contains('/workspaces/')
            ? http.Response('{}', 429, headers: {'retry-after': '30'})
            : http.Response('{"timezone":"Europe/Paris"}', 200),
      ),
    );
    final repository = TimezoneSettingsRepository(apiClient: api);
    final cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: getVerifiedDeviceTimezoneIdentifier,
      clock: () => now,
    );
    await cubit.load(userId: user.id, workspaceId: 'workspace-a');
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.personalLoaded, isTrue);
    expect(cubit.state.workspaceLoaded, isFalse);
    expect(cubit.state.resolved, isFalse);
    await cubit.reload();
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.personalLoaded, isTrue);
    await cubit.close();
    repository.dispose();
    api.dispose();
  });
}
