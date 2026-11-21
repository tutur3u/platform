import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router_access_redirects.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_state.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_link_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_requests_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_status_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_routes.dart';
import 'package:mobile/features/mastermind/view/mastermind_routes.dart';

import 'fleet_access_fakes.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
void main() {
  late FakeFleetAccessSource source;
  late FleetAccessCubit access;

  setUp(() {
    source = FakeFleetAccessSource();
    access = FleetAccessCubit(source: source);
  });

  tearDown(() => access.close());

  group('visibility', () {
    test('a disabled answer hides the view', () async {
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess.disabled());
      await access.ensureLoaded();
      expect(access.state.status, FleetAccessStatus.loaded);
      expect(access.state.visible, isFalse);
    });

    test('an enabled answer shows it, and later checks reuse it', () async {
      await access.ensureLoaded();
      await access.ensureLoaded();
      expect(access.state.visible, isTrue);
      expect(access.state.access, observerAccess);
      expect(source.accessCalls, 1);
    });

    test('a stopped Fleet hides it', () async {
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess(enabled: false, stopped: true));
      await access.sync();
      expect(access.state.visible, isFalse);
    });

    test('a failed check hides it; there is no stored fallback', () async {
      source.accessAnswers
        ..clear()
        ..add(fleetApiError(503));
      await access.sync();
      expect(access.state.status, FleetAccessStatus.error);
      expect(access.state.visible, isFalse);
    });

    test('a revoke mid-session hides it on the next 403', () async {
      source.accessAnswers
        ..clear()
        ..addAll([observerAccess, const FleetAccess.disabled()]);
      await access.sync();
      expect(access.state.visible, isTrue);
      await access.handleForbidden();
      expect(access.state.visible, isFalse);
    });

    test('a quiet check keeps the view through a blip but not a 403', () async {
      source.accessAnswers
        ..clear()
        ..addAll([observerAccess, fleetApiError(503), fleetApiError(403)]);
      await access.sync();
      await access.sync(quiet: true);
      expect(access.state.visible, isTrue);
      await access.sync(quiet: true);
      expect(access.state.status, FleetAccessStatus.error);
    });

    test('an answer for the previous account is dropped after reset', () async {
      source.accessGate = Completer<void>();
      final pending = access.sync();
      access.reset();
      source.accessGate!.complete();
      await pending;
      expect(access.state.status, FleetAccessStatus.initial);
    });
  });

  group('route gate', () {
    const loaded = FleetAccessState(
      status: FleetAccessStatus.loaded,
      access: observerAccess,
    );

    test('holds while checking, then admits only an enabled answer', () {
      bool redirect(FleetAccessState state) =>
          shouldRedirectDisabledFleetAccessRoute(
            Routes.mastermindFleetAccess,
            state,
          );
      expect(redirect(const FleetAccessState()), isFalse);
      expect(
        redirect(const FleetAccessState(status: FleetAccessStatus.loading)),
        isFalse,
      );
      expect(redirect(loaded), isFalse);
      expect(
        redirect(const FleetAccessState(status: FleetAccessStatus.loaded)),
        isTrue,
      );
      expect(
        redirect(const FleetAccessState(status: FleetAccessStatus.error)),
        isTrue,
      );
      expect(
        shouldRedirectDisabledFleetAccessRoute(Routes.mastermindInbox, loaded),
        isFalse,
      );
    });

    test('the owner-only Mastermind gate leaves the Fleet view alone', () {
      const denied = MastermindAccessState(
        status: MastermindAccessStatus.loaded,
      );
      expect(
        shouldRedirectDisabledMastermindRoutes(
          Routes.mastermindFleetAccess,
          denied,
        ),
        isFalse,
      );
      expect(
        shouldRedirectDisabledMastermindRoutes(Routes.mastermindInbox, denied),
        isTrue,
      );
    });

    test('the route sits with the Mastermind pushed routes', () {
      expect(
        mastermindTabRoutes.map((route) => route.path),
        contains(Routes.mastermindFleetAccess),
      );
    });

    test('views round-trip through the location', () {
      expect(fleetAccessLocation(), Routes.mastermindFleetAccess);
      expect(
        fleetAccessLocation(view: FleetAccessView.requests),
        '/mastermind/fleet-access?view=requests',
      );
      expect(fleetAccessViewFromQuery('requests'), FleetAccessView.requests);
      expect(fleetAccessViewFromQuery('nope'), FleetAccessView.status);
    });
  });

  group('status', () {
    test(
      'a failed refresh keeps the digest; a 403 drops it and re-checks',
      () async {
        source.digestAnswers
          ..clear()
          ..addAll([
            FleetDigest(sections: [section()]),
            fleetApiError(503),
            fleetApiError(403),
          ]);
        source.accessAnswers
          ..clear()
          ..addAll([observerAccess, const FleetAccess.disabled()]);
        await access.sync();
        final status = FleetStatusCubit(
          source: source,
          onForbidden: access.handleForbidden,
        );
        addTearDown(status.close);

        await status.load();
        expect(status.state.digest?.sections, hasLength(1));
        await status.load();
        expect(status.state.digest, isNotNull);
        expect(status.state.failure, FleetAccessFailure.unavailable);
        await status.load();
        expect(status.state.digest, isNull);
        expect(status.state.failure, FleetAccessFailure.forbidden);
        expect(access.state.visible, isFalse);
      },
    );
  });

  group('requests', () {
    FleetIntentReceipt receipt(
      int n,
      FleetIntentState state,
    ) => FleetIntentReceipt(
      id: 'fc000000-0000-4000-8000-0000000000${n.toString().padLeft(2, '0')}',
      kind: FleetIntentKind.statusQuestion,
      state: state,
      createdAt: fleetAccessTestNow,
    );

    test('pages through receipts and reloads after a submission', () async {
      source.intentAnswers
        ..clear()
        ..addAll([
          FleetIntentPage(
            intents: [receipt(1, FleetIntentState.done)],
            nextBefore: receipt(1, FleetIntentState.done).id,
          ),
          FleetIntentPage(intents: [receipt(2, FleetIntentState.expired)]),
          FleetIntentPage(
            intents: [receipt(3, FleetIntentState.pendingApproval)],
          ),
        ]);
      final requests = FleetRequestsCubit(
        source: source,
        onForbidden: access.handleForbidden,
      );
      addTearDown(requests.close);

      await requests.load();
      expect(requests.state.hasMore, isTrue);
      await requests.loadMore();
      expect(requests.state.receipts, hasLength(2));
      expect(requests.state.hasMore, isFalse);
      expect(source.intentCursors, [
        null,
        receipt(1, FleetIntentState.done).id,
      ]);

      const draft = FleetIntentDraft(
        kind: FleetIntentKind.statusQuestion,
        projectKey: 'platform',
        topic: FleetTopic.status,
      );
      await requests.submit(draft);
      expect(source.submitted, [draft]);
      expect(
        requests.state.receipts?.single.state,
        FleetIntentState.pendingApproval,
      );
    });

    test(
      'a refused submission throws its category and keeps the list',
      () async {
        source.submitAnswers
          ..clear()
          ..add(fleetApiError(429, 'intents_per_day'));
        final requests = FleetRequestsCubit(
          source: source,
          onForbidden: access.handleForbidden,
        );
        addTearDown(requests.close);
        await requests.load();
        await expectLater(
          requests.submit(
            const FleetIntentDraft(
              kind: FleetIntentKind.statusQuestion,
              projectKey: 'platform',
              topic: FleetTopic.status,
            ),
          ),
          throwsA(
            isA<FleetAccessException>().having(
              (e) => e.failure,
              'failure',
              FleetAccessFailure.quota,
            ),
          ),
        );
        expect(requests.state.receipts, isEmpty);
      },
    );
  });

  group('link', () {
    late FleetLinkCubit link;

    setUp(() {
      link = FleetLinkCubit(
        source: source,
        onForbidden: access.handleForbidden,
      );
    });

    tearDown(() => link.close());

    test('code, preview and confirm walk the link to linked', () async {
      await link.issue();
      expect(link.state.step, FleetLinkStep.issued);
      expect(link.state.code?.code, linkCode);

      await link.preview(linkId: linkId, confirmationCode: confirmationCode);
      expect(link.state.step, FleetLinkStep.pending);
      expect(link.state.preview?.channel, FleetChannel.zalo);
      expect(link.state.preview?.accountLabel, 'Mira Zalo');

      await link.confirm();
      expect(link.state.step, FleetLinkStep.linked);
      expect(link.state.preview?.linked, isTrue);
      // The single-use proof does not outlive the link.
      expect(link.state.linkId, isNull);
      expect(link.state.confirmationCode, isNull);
      expect(source.confirmCalls.map((c) => c.preview), [true, false]);
    });

    test('a wrong or expired confirmation stays on the code step', () async {
      source.confirmAnswers.add(fleetApiError(403, 'invalid_confirmation'));
      await link.issue();
      await link.preview(linkId: linkId, confirmationCode: confirmationCode);
      expect(link.state.step, FleetLinkStep.issued);
      expect(link.state.failure, FleetAccessFailure.invalidConfirmation);
      // Not a grant refusal: access is not re-checked.
      expect(source.accessCalls, 0);
    });

    test('an already linked chat account is reported on confirm', () async {
      source.confirmAnswers.addAll([
        const FleetLinkPreview(
          channel: FleetChannel.discord,
          accountLabel: 'Mira Discord',
          linked: false,
        ),
        fleetApiError(409, 'identity_already_linked'),
      ]);
      await link.issue();
      await link.preview(linkId: linkId, confirmationCode: confirmationCode);
      await link.confirm();
      expect(link.state.step, FleetLinkStep.pending);
      expect(link.state.failure, FleetAccessFailure.alreadyLinked);
    });

    test('a refused code request re-checks access', () async {
      source.codeAnswers.add(fleetApiError(403, 'forbidden'));
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess.disabled());
      await link.issue();
      expect(link.state.step, FleetLinkStep.idle);
      expect(link.state.failure, FleetAccessFailure.forbidden);
      expect(source.accessCalls, 1);
    });
  });
}
