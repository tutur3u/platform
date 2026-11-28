import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_repository.dart';

import 'mira_ai_consent_fakes.dart';

void main() {
  group('MiraAiConsentRepository', () {
    test('reads and stores consent with the agreed body', () async {
      final requests = <http.Request>[];
      final api = syntheticAuthedApi((request) async {
        requests.add(request);
        final granted = request.method == 'PUT'
            ? (jsonDecode(request.body) as Map)['granted'] == true
            : false;
        return http.Response(
          jsonEncode({
            'granted': granted,
            'provider': 'google_gemini',
            'policyVersion': granted ? '2026-11-28' : null,
            'grantedAt': granted ? '2026-11-28T09:00:00Z' : null,
            'withdrawnAt': null,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      addTearDown(api.dispose);
      final repository = MiraAiConsentRepository(apiClient: api);

      final read = await repository.fetch(consentActor);
      final saved = await repository.save(
        consentActor,
        granted: true,
        source: MiraAiConsentSource.miraPrompt,
      );

      expect(read.granted, isFalse);
      expect(saved.granted, isTrue);
      expect(saved.grantedAt, DateTime.utc(2026, 11, 28, 9));
      expect(requests.map((r) => '${r.method} ${r.url.path}'), [
        'GET /api/v1/users/me/ai-data-consent',
        'PUT /api/v1/users/me/ai-data-consent',
      ]);
      expect(jsonDecode(requests.last.body), {
        'granted': true,
        'source': 'mobile_mira_prompt',
        'policyVersion': '2026-11-28',
      });
    });

    test('only an explicit true is consent', () {
      expect(MiraAiConsent.fromJson({'granted': 'true'}).granted, isFalse);
      expect(MiraAiConsent.fromJson({}).granted, isFalse);
    });
  });

  group('MiraAiConsentController', () {
    test('caches the server answer and shares one read', () async {
      final repository = FakeMiraAiConsentRepository(
        server: const MiraAiConsent(granted: true),
      );
      final controller = fakeConsentController(repository);
      addTearDown(controller.dispose);

      expect(controller.granted, isFalse);
      await Future.wait([controller.refresh(), controller.refresh()]);
      expect(repository.fetches, 1);
      expect(controller.granted, isTrue);
      expect(await controller.ensureKnown(), isTrue);
      expect(repository.fetches, 1);
    });

    test('an unknown answer is not consent and is asked again', () async {
      final repository = FakeMiraAiConsentRepository(
        server: const MiraAiConsent(granted: true),
      )..failFetch = true;
      final controller = fakeConsentController(repository);
      addTearDown(controller.dispose);

      expect(await controller.ensureKnown(), isFalse);
      expect(controller.known, isFalse);
      expect(controller.failed, isTrue);
      repository.failFetch = false;
      expect(await controller.ensureKnown(), isTrue);
      expect(repository.fetches, 2);
    });

    test('an answer belongs to the user it was read for', () async {
      var user = consentActor;
      final repository = FakeMiraAiConsentRepository(
        server: const MiraAiConsent(granted: true),
      );
      final controller = fakeConsentController(
        repository,
        currentUserId: () => user,
      );
      addTearDown(controller.dispose);
      await controller.refresh();
      expect(controller.granted, isTrue);

      user = '44444444-4444-4444-8444-444444444444';
      expect(controller.granted, isFalse);
      expect(controller.known, isFalse);
    });

    test('revoking stops sends before the server answers', () async {
      final repository = FakeMiraAiConsentRepository(
        server: const MiraAiConsent(granted: true),
      );
      final controller = fakeConsentController(repository);
      addTearDown(controller.dispose);
      await controller.refresh();

      final saving = controller.setGranted(
        granted: false,
        source: MiraAiConsentSource.settings,
      );
      expect(controller.granted, isFalse);
      expect(await saving, isTrue);
      expect(repository.saves, [(granted: false, source: 'mobile_settings')]);
    });

    test('a failed Allow never grants', () async {
      final repository = FakeMiraAiConsentRepository()..failSave = true;
      final controller = fakeConsentController(repository);
      addTearDown(controller.dispose);

      final saved = await controller.setGranted(
        granted: true,
        source: MiraAiConsentSource.miraPrompt,
      );
      expect(saved, isFalse);
      expect(controller.granted, isFalse);
    });

    test('a server refusal forgets the cached grant', () async {
      final repository = FakeMiraAiConsentRepository(
        server: const MiraAiConsent(granted: true),
      );
      final controller = fakeConsentController(repository);
      addTearDown(controller.dispose);
      await controller.refresh();

      controller.consentRequired();
      expect(controller.granted, isFalse);
      expect(controller.known, isTrue);
    });

    test('recognises the consent refusal code', () {
      expect(
        isMiraAiConsentRequired(
          const ApiException(
            message: 'ai_consent_required',
            statusCode: 403,
            code: 'ai_consent_required',
          ),
        ),
        isTrue,
      );
      expect(
        isMiraAiConsentRequired(
          const ApiException(message: 'Forbidden', statusCode: 403),
        ),
        isFalse,
      );
    });
  });
}
