import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_eligibility_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

const Map<String, dynamic> _proPersonal = {
  'eligible': true,
  'reason': null,
  'tier': 'PRO',
  'billing': {'name': null, 'personal': true},
  'params': {
    'plans': ['PLUS', 'PRO', 'ENTERPRISE'],
  },
};

void main() {
  setUpAll(initializeDateFormatting);

  group('AssistantLiveEligibility.fromJson', () {
    test('a Pro personal workspace is eligible', () {
      final e = AssistantLiveEligibility.fromJson(_proPersonal);
      expect(e.eligible, isTrue);
      expect(e.blocked, isFalse);
      expect(e.tier, 'PRO');
      expect(e.billingPersonal, isTrue);
    });

    test('parses each refusal and its safe params', () {
      final e = AssistantLiveEligibility.fromJson(const {
        'eligible': false,
        'reason': 'credits_exhausted',
        'tier': 'PRO',
        'billing': {'name': 'Acme', 'personal': false},
        'params': {
          'plans': ['PLUS', 'PRO', 'ENTERPRISE'],
          'balance': 120,
          'minimumCredits': 500,
        },
      });
      expect(e.reason, AssistantLiveBlockReason.creditsExhausted);
      expect(e.balance, 120);
      expect(e.minimumCredits, 500);
      expect(e.billingName, 'Acme');
    });

    test('an unknown refusal code still refuses', () {
      final e = AssistantLiveEligibility.fromJson(const {
        'eligible': false,
        'reason': 'something_new',
      });
      expect(e.blocked, isTrue);
      expect(e.reason, AssistantLiveBlockReason.paused);
    });
  });

  test('token refusals map to the same reasons', () {
    final now = DateTime.utc(2026, 11, 20, 3);
    final limit = AssistantLiveEligibility.fromTokenFailure(
      const ApiException(
        message: 'x',
        statusCode: 429,
        code: 'LIVE_MINT_ACTOR_LIMIT',
        retryAfter: 3600,
      ),
      now: now,
    );
    expect(limit?.reason, AssistantLiveBlockReason.limitReached);
    expect(limit?.resetAt, now.add(const Duration(hours: 1)));
    expect(
      AssistantLiveEligibility.fromTokenFailure(
        const ApiException(message: 'x', statusCode: 403, code: 'LIVE_BLOCKED'),
      )?.reason,
      AssistantLiveBlockReason.planRequired,
    );
    expect(
      AssistantLiveEligibility.fromTokenFailure(
        const ApiException(message: 'x', statusCode: 500),
      ),
      isNull,
    );
  });

  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    test('every reason has distinct ${l10n.localeName} copy', () {
      final titles = <String>{};
      final shorts = <String>{};
      for (final reason in AssistantLiveBlockReason.values) {
        final e = AssistantLiveEligibility(
          eligible: false,
          reason: reason,
          balance: 120,
          minimumCredits: 500,
          resetAt: DateTime(2026, 11, 21, 7),
          billingPersonal: true,
        );
        titles.add(e.title(l10n));
        shorts.add(e.shortReason(l10n));
        final body = e.body(l10n, now: DateTime(2026, 11, 20, 9));
        expect(body, isNotEmpty);
        expect(body, isNot(contains('_')), reason: reason.code);
        expect(
          e.billedTo(l10n),
          l10n.assistantLiveBlockedBilledTo(
            l10n.assistantLiveBlockedPersonalWorkspace,
          ),
        );
      }
      expect(titles, hasLength(AssistantLiveBlockReason.values.length));
      expect(shorts, hasLength(AssistantLiveBlockReason.values.length));
    });
  }

  test('limit copy names the local reset time and plan copy names plans', () {
    final l10n = AppLocalizationsEn();
    final today = DateTime(2026, 11, 20, 9);
    final limit = AssistantLiveEligibility(
      eligible: false,
      reason: AssistantLiveBlockReason.limitReached,
      resetAt: DateTime(2026, 11, 20, 17, 30),
    );
    // Intl separates the period with a narrow no-break space.
    expect(
      limit.body(l10n, now: today).replaceAll('\u202f', ' '),
      'You can start again at 5:30 PM.',
    );
    const plan = AssistantLiveEligibility(
      eligible: false,
      reason: AssistantLiveBlockReason.planRequired,
    );
    expect(plan.body(l10n), contains('Plus, Pro, Enterprise'));
  });

  group('AssistantLiveEligibilityCubit', () {
    test('caches per actor and workspace for the TTL', () async {
      var now = DateTime(2026, 11, 20, 9);
      var calls = 0;
      final cubit = AssistantLiveEligibilityCubit(
        fetch: (_) async {
          calls++;
          return AssistantLiveEligibility.fromJson(_proPersonal);
        },
        now: () => now,
      );
      addTearDown(cubit.close);
      await cubit.ensure(actorId: 'a', wsId: 'w');
      await cubit.ensure(actorId: 'a', wsId: 'w');
      expect(calls, 1);
      await cubit.ensure(actorId: 'b', wsId: 'w');
      expect(calls, 2);
      now = now.add(const Duration(seconds: 31));
      await cubit.ensure(actorId: 'b', wsId: 'w');
      expect(calls, 3);
      await cubit.ensure(actorId: 'b', wsId: 'w', force: true);
      expect(calls, 4);
    });

    test('locks only on a known refusal; a failed check stays open', () async {
      final cubit = AssistantLiveEligibilityCubit(
        fetch: (_) async => throw Exception('offline'),
      );
      addTearDown(cubit.close);
      expect(await cubit.ensure(actorId: 'a', wsId: 'w'), isNull);
      expect(cubit.state.blockedFor('a:w'), isFalse);
      cubit.recordRefusal(
        actorId: 'a',
        wsId: 'w',
        refusal: const AssistantLiveEligibility(
          eligible: false,
          reason: AssistantLiveBlockReason.planRequired,
        ),
      );
      expect(cubit.state.blockedFor('a:w'), isTrue);
      expect(cubit.state.blockedFor('a:other'), isFalse);
    });
  });
}
