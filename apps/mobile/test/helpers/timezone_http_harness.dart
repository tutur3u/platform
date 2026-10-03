import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/api_origins.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

class TimezoneHttpHarness {
  TimezoneHttpHarness() {
    final origins = ApiOrigins.forFlavor(AppFlavor.production);
    final client = _Client();
    final auth = _Auth();
    final session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(
      const User(
        id: 'synthetic-actor',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2030',
      ),
    );
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-access');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    when(auth.refreshSession).thenAnswer(
      (_) async => AuthResponse(session: session, user: auth.currentUser),
    );
    api = ApiClient(
      baseUrl: origins.baseUrlForPath(TimezoneSettingsRepository.personalPath),
      authClient: client,
      httpClient: MockClient((request) async {
        requests.add(request);
        return await respond(request);
      }),
    );
    repository = TimezoneSettingsRepository(apiClient: api);
  }
  late final ApiClient api;
  late final TimezoneSettingsRepository repository;
  final requests = <http.Request>[];
  Future<http.Response> Function(http.Request) respond = (_) async =>
      json({'error': 'Synthetic unavailable'}, status: 503);
  static http.Response json(Object value, {int status = 200}) => http.Response(
    jsonEncode(value),
    status,
    headers: {'content-type': 'application/json'},
  );
  void dispose() {
    repository.dispose();
    api.dispose();
  }
}
