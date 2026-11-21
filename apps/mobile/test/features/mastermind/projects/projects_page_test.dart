import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/projects_location.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_page.dart';
import 'package:mobile/features/mastermind/projects/view/projects_page.dart';
import 'package:mobile/features/mastermind/projects/view/reply_receipt_line.dart';
import 'package:mobile/features/mastermind/projects/view/thread_bubbles.dart';

import '../../../helpers/pump_app.dart';

final _now = DateTime.utc(2026, 11, 22, 7);

void main() {
  late FixtureProjectsRepository repository;

  setUp(() => repository = FixtureProjectsRepository(now: _now));

  Future<void> pumpProjects(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      ProjectsPage(repository: repository, live: false, now: () => _now),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('project headers show state counts; idle as a plain number', (
    tester,
  ) async {
    await pumpProjects(tester);
    expect(find.text('tuturuuu'), findsOneWidget);
    expect(find.text('Unassigned'), findsOneWidget);
    final header = find.ancestor(
      of: find.text('tuturuuu'),
      matching: find.byType(InkWell),
    );
    for (final count in ['2', '1', '4996']) {
      expect(
        find.descendant(of: header, matching: find.text(count)),
        findsWidgets,
      );
    }
    expect(find.text('Search threads'), findsOneWidget);
    // Chips use the badge words and carry the totals across projects.
    for (final (label, count) in [
      ('Agent working', '10'),
      ('Waiting for you', '5'),
      ('Failed', '4'),
      ('Finished', '5014'),
    ]) {
      expect(
        find.descendant(
          of: find
              .ancestor(of: find.text(label), matching: find.byType(Row))
              .first,
          matching: find.text(count),
        ),
        findsOneWidget,
        reason: label,
      );
    }
  });

  testWidgets('Load 50 more pages the 5,000-thread project', (tester) async {
    await pumpProjects(tester);
    expect(
      find.byKey(const ValueKey('projects-thread-p_tuturuuu_49')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('projects-thread-p_tuturuuu_50')),
      findsNothing,
    );
    final more = find.text('Load 50 more').first;
    await tester.ensureVisible(more);
    await tester.pumpAndSettle();
    await tester.tap(more);
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('projects-thread-p_tuturuuu_99')),
      findsOneWidget,
    );
  });

  testWidgets('a linked machine lists flat after a loading row; '
      'an unreachable one is greyed and inert', (tester) async {
    await pumpProjects(tester);
    expect(
      find.ancestor(
        of: find.text('Build box'),
        matching: find.byWidgetPredicate(
          (w) => w is Opacity && w.opacity == 0.45,
        ),
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Build box'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('tuturuuu'), findsOneWidget);

    repository.calls.clear();
    await tester.tap(find.text('M4 Studio'));
    await tester.pump();
    const reading = 'Reading M4 Studio. This takes a few seconds.';
    expect(find.text(reading), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(reading), findsNothing);
    expect(find.text('tuturuuu'), findsNothing);
    expect(
      find.byKey(const ValueKey('projects-thread-env_m4_0')),
      findsOneWidget,
    );
    expect(repository.calls.where((c) => c.startsWith('projects')), isEmpty);
  });

  testWidgets('machine_offline on resume keeps the list with its time', (
    tester,
  ) async {
    await pumpProjects(tester);
    repository.failNext = ProjectsFailureKind.machineOffline;
    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.paused);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.textContaining('Showing the list from'), findsOneWidget);
    expect(find.text('tuturuuu'), findsOneWidget);
  });

  testWidgets('a thread loads earlier messages and shows the receipt', (
    tester,
  ) async {
    final bridge = (await repository.machines()).first;
    await tester.pumpApp(
      ProjectThreadPage(
        machine: bridge,
        threadId: 'p_tuturuuu_0',
        repository: repository,
        live: false,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('projects-message-39')), findsOneWidget);
    expect(find.textContaining('[redacted]', findRichText: true), findsWidgets);

    final earlier = find.byKey(const ValueKey('projects-load-earlier'));
    await tester.dragUntilVisible(
      earlier,
      find.byType(Scrollable).first,
      const Offset(0, 300),
    );
    await tester.tap(earlier);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('projects-load-earlier')), findsNothing);
    await tester.dragUntilVisible(
      find.text('Agent working'),
      find.byType(Scrollable).first,
      const Offset(0, 300),
    );
    expect(find.text('Agent working'), findsOneWidget);
    expect(find.text('Truncated'), findsWidgets);

    await tester.enterText(
      find.byKey(const ValueKey('projects-composer-field')).last,
      'Keep going',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('projects-composer-send')));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.text('Sent'),
      find.byType(Scrollable).first,
      const Offset(0, -300),
    );
    expect(find.text('Sent'), findsOneWidget);
    expect(find.text('Keep going'), findsOneWidget);
  });

  testWidgets('receipt lines say each delivery state', (tester) async {
    await tester.pumpApp(
      Column(
        children: [
          for (final phase in ReplyPhase.values) ReplyReceiptLine(phase: phase),
        ],
      ),
    );
    for (final text in [
      'Sending',
      'Sent',
      'Steered into the running turn',
      'Started',
      'Queued',
      'Not delivered',
    ]) {
      expect(find.text(text), findsOneWidget);
    }
  });

  testWidgets('mfa_required offers Sign in again, not Retry', (tester) async {
    var signIns = 0;
    Widget bubble(ProjectsFailureKind failure) => PostedReplyBubble(
      reply: PostedReply(
        localId: 'l1',
        text: 'Ship it',
        idempotencyKey: 'k',
        at: _now,
        sending: false,
        failure: failure,
      ),
      onRetry: () {},
      onSignIn: () => signIns++,
    );
    await tester.pumpApp(bubble(ProjectsFailureKind.mfaRequired));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsNothing);
    await tester.tap(find.text('Sign in again'));
    expect(signIns, 1);

    await tester.pumpApp(bubble(ProjectsFailureKind.unavailable));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);

    await tester.pumpApp(bubble(ProjectsFailureKind.forbidden));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsNothing);
    expect(find.text('Sign in again'), findsNothing);
  });

  test('projectsLocation keeps the Work path', () {
    expect(projectsLocation(), '/mastermind/work');
    expect(
      projectsLocation(state: ProjectThreadState.waiting),
      '/mastermind/work?state=waiting',
    );
  });
}
