import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_page.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/pump_app.dart';

/// Records every reply key it is asked to send.
class _Recording implements FleetThreadSource {
  _Recording(this._inner);

  final FleetThreadSource _inner;
  final keys = <String>[];

  @override
  Future<FleetThreadReply> reply({
    required String machineId,
    required String threadId,
    required String text,
    required String idempotencyKey,
    String? environmentId,
  }) {
    keys.add(idempotencyKey);
    return _inner.reply(
      machineId: machineId,
      threadId: threadId,
      text: text,
      idempotencyKey: idempotencyKey,
      environmentId: environmentId,
    );
  }

  @override
  Future<FleetThreadReply> receipt(String replyId) => _inner.receipt(replyId);

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _Repository extends FixtureProjectsRepository {
  _Repository() : super(now: DateTime.utc(2026, 11, 22, 7));

  late final recording = _Recording(super.replySource);

  @override
  FleetThreadSource get replySource => recording;
}

void main() {
  late _Repository repository;
  var codes = <String>[];

  setUp(() {
    repository = _Repository();
    codes = [];
  });

  FleetReplyStepUp stepUp({
    bool code = true,
    Exception? deviceError,
    bool registered = true,
  }) => FleetReplyStepUp.using(
    verifyCode: (value) async {
      codes.add(value);
      return code;
    },
    verifyDevice: (reason) async {
      if (deviceError != null) throw deviceError;
    },
    deviceRegistered: () async => registered,
  );

  Future<void> openAndNeedMfa(WidgetTester tester, FleetReplyStepUp up) async {
    final bridge = (await repository.machines()).first;
    await tester.pumpApp(
      ProjectThreadPage(
        machine: bridge,
        threadId: 'p_tuturuuu_0',
        repository: repository,
        stepUp: up,
        live: false,
      ),
    );
    await tester.pumpAndSettle();
    repository.failNext = ProjectsFailureKind.mfaRequired;
    await tester.enterText(
      find.byKey(const ValueKey('projects-composer-field')).last,
      'Ship it',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('projects-composer-send')));
    await tester.pumpAndSettle();
    expect(find.text('Verify this device with MFA to reply'), findsOneWidget);
    expect(find.text('Not delivered'), findsNothing);
  }

  Future<void> enterCode(WidgetTester tester) async {
    await tester.enterText(
      find.byKey(const ValueKey('projects-step-up-code')),
      '123456',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('projects-step-up-verify')));
    await tester.pumpAndSettle();
  }

  testWidgets('a verified code resends the same reply under its key', (
    tester,
  ) async {
    await openAndNeedMfa(tester, stepUp());
    await enterCode(tester);
    expect(codes, ['123456']);
    expect(find.text('Sent'), findsOneWidget);
    final keys = repository.recording.keys;
    expect(keys, hasLength(2));
    expect(keys.toSet(), hasLength(1));
  });

  testWidgets('a verified device unlock resends too', (tester) async {
    await openAndNeedMfa(tester, stepUp());
    await tester.tap(find.byKey(const ValueKey('projects-step-up-device')));
    await tester.pumpAndSettle();
    expect(find.text('Sent'), findsOneWidget);
    expect(repository.recording.keys.toSet(), hasLength(1));
  });

  testWidgets('a dismissed device unlock stays quietly on needs MFA', (
    tester,
  ) async {
    await openAndNeedMfa(
      tester,
      stepUp(
        deviceError: const AuthException(
          'cancelled',
          code: 'device_verification_cancelled',
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('projects-step-up-device')));
    await tester.pumpAndSettle();
    expect(find.text('Verify this device with MFA to reply'), findsOneWidget);
    expect(find.text('That did not verify. Try again.'), findsNothing);
    expect(repository.recording.keys, hasLength(1));
  });

  testWidgets('a failed code says so and can be tried again', (tester) async {
    await openAndNeedMfa(tester, stepUp(code: false));
    await enterCode(tester);
    expect(find.text('That did not verify. Try again.'), findsOneWidget);
    expect(find.byKey(const ValueKey('projects-step-up-code')), findsOneWidget);
    expect(repository.recording.keys, hasLength(1));
  });

  testWidgets('without a device authenticator only the code is offered', (
    tester,
  ) async {
    await openAndNeedMfa(tester, stepUp(registered: false));
    expect(find.byKey(const ValueKey('projects-step-up-device')), findsNothing);
    expect(find.byKey(const ValueKey('projects-step-up-code')), findsOneWidget);
  });
}
