import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const consentActor = '33333333-3333-4333-8333-333333333333';

/// A cubit-side gate with a scripted answer to each request.
class FakeMiraAiConsentGate implements MiraAiConsentGate {
  FakeMiraAiConsentGate({this.granted = false, this.allow = false});

  @override
  bool granted;

  /// What the next request resolves to; an Allow also grants.
  bool allow;
  int requests = 0;
  int refusals = 0;

  @override
  Future<bool> request() async {
    requests++;
    if (allow) granted = true;
    return allow;
  }

  @override
  void consentRequired() {
    refusals++;
    granted = false;
  }
}

/// The consent route held in memory, recording every save.
class FakeMiraAiConsentRepository implements MiraAiConsentRepository {
  FakeMiraAiConsentRepository({this.server = MiraAiConsent.denied});

  MiraAiConsent server;
  bool failFetch = false;
  bool failSave = false;
  int fetches = 0;
  final saves = <({bool granted, String source})>[];

  @override
  Future<MiraAiConsent> fetch(String userId) async {
    fetches++;
    if (failFetch) {
      throw const ApiException(message: 'Synthetic offline', statusCode: 0);
    }
    return server;
  }

  @override
  Future<MiraAiConsent> save(
    String userId, {
    required bool granted,
    required MiraAiConsentSource source,
  }) async {
    saves.add((granted: granted, source: source.code));
    if (failSave) {
      throw const ApiException(message: 'Synthetic failure', statusCode: 503);
    }
    return server = MiraAiConsent(
      granted: granted,
      policyVersion: miraAiConsentPolicyVersion,
      grantedAt: granted ? DateTime.utc(2026, 11, 28, 9) : null,
      withdrawnAt: granted ? null : DateTime.utc(2026, 11, 28, 10),
    );
  }
}

MiraAiConsentController fakeConsentController(
  FakeMiraAiConsentRepository repository, {
  String? Function()? currentUserId,
}) => MiraAiConsentController(
  repository: repository,
  currentUserId: currentUserId ?? () => consentActor,
);

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

/// An authenticated client whose requests [handle] answers.
ApiClient syntheticAuthedApi(
  Future<http.Response> Function(http.Request) handle,
) {
  final client = _Client();
  final auth = _Auth();
  final session = _Session();
  when(() => client.auth).thenReturn(auth);
  when(() => auth.currentUser).thenReturn(
    const User(
      id: consentActor,
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '2030',
    ),
  );
  when(() => auth.currentSession).thenReturn(session);
  when(() => session.accessToken).thenReturn('synthetic-access');
  when(() => session.expiresAt).thenReturn(
    DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000,
  );
  return ApiClient(
    baseUrl: 'https://fixture.test',
    authClient: client,
    httpClient: MockClient((request) async {
      if (request.url.path == '/api/v1/native-integrity/challenge') {
        return http.Response(
          jsonEncode({'mode': 'off'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return handle(request);
    }),
  );
}
