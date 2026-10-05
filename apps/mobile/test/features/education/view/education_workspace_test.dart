import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/repositories/education_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/education/view/education_page.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

EducationPagedResult<T> pageRows<T>(List<T> rows, {int? count, int page = 1}) =>
    EducationPagedResult(
      items: rows,
      count: count ?? rows.length,
      page: page,
      pageSize: 20,
    );
EducationCourse course(String id) => EducationCourse(id: id, name: id);

class Repository extends Mock implements EducationRepository {
  Future<EducationPagedResult<EducationCourse>> Function(String, int, String)?
  readCourses;
  Future<EducationAttemptListResult> Function()? readAttempts;
  Future<void> Function()? saveCourse;
  @override
  Future<void> createCourse(
    String wsId, {
    required String name,
    String? description,
  }) async {
    await saveCourse?.call();
  }

  final requests = <(String, int, String)>[];
  @override
  Future<EducationPagedResult<EducationCourse>> getCourses(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    requests.add((wsId, page, query));
    final result =
        await (readCourses?.call(wsId, page, query) ??
            Future.value(pageRows([course('Course')])));
    return pageSize == 3
        ? pageRows(result.items.take(3).toList(), count: result.count)
        : result;
  }

  @override
  Future<EducationPagedResult<EducationQuiz>> getQuizzes(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async => pageRows([]);
  @override
  Future<EducationPagedResult<EducationQuizSet>> getQuizSets(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async => pageRows([]);
  @override
  Future<EducationPagedResult<EducationFlashcard>> getFlashcards(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async => pageRows([]);
  @override
  Future<EducationAttemptListResult> getAttempts(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
    String? setId,
    String sortBy = 'newest',
    String sortDirection = 'desc',
  }) async =>
      await (readAttempts?.call() ??
          Future.value(
            const EducationAttemptListResult(
              attempts: [],
              count: 0,
              page: 1,
              pageSize: 20,
              sets: [],
            ),
          ));
}

void main() {
  late Repository repository;
  setUp(() => repository = Repository());
  Widget page({String actor = 'actor', String workspace = 'ws'}) =>
      EducationWorkspace(
        key: ValueKey('$actor:$workspace'),
        actorId: actor,
        workspaceId: workspace,
        repository: repository,
      );
  Future<void> courses(WidgetTester tester) async {
    final nav = tester.widget<ShellMiniNav>(find.byType(ShellMiniNav));
    nav.items
        .singleWhere((item) => item.id == 'education-courses')
        .onPressed!();
    await tester.pumpAndSettle();
  }

  Future<void> reveal(WidgetTester tester, String text) =>
      tester.scrollUntilVisible(
        find.text(text),
        200,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );

  testWidgets(
    'late departed workspace response cannot repopulate the new session',
    (tester) async {
      final old = Completer<EducationPagedResult<EducationCourse>>();
      repository.readCourses = (ws, _, _) async =>
          ws == 'old' ? await old.future : pageRows([course('New course')]);
      await tester.pumpApp(page(workspace: 'old'));
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpApp(page(workspace: 'new'));
      await tester.pumpAndSettle();
      old.complete(pageRows([course('Old course')]));
      await tester.pumpAndSettle();
      expect(find.text('Old course'), findsNothing);
      await reveal(tester, 'New course');
      expect(find.text('New course'), findsOneWidget);
    },
  );
  testWidgets('denied attempt reports do not hide authorized courses', (
    tester,
  ) async {
    repository.readAttempts = () async =>
        throw const ApiException(message: 'Denied reports', statusCode: 403);
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await reveal(tester, 'Course');
    expect(find.text('Course'), findsOneWidget);
  });
  testWidgets('slow optional reports do not block course publication', (
    tester,
  ) async {
    final pending = Completer<EducationAttemptListResult>();
    repository.readAttempts = () => pending.future;
    await tester.pumpApp(page());
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump();
    await reveal(tester, 'Course');
    expect(find.text('Course'), findsOneWidget);
    pending.complete(
      const EducationAttemptListResult(
        attempts: [],
        count: 0,
        page: 1,
        pageSize: 3,
        sets: [],
      ),
    );
    await tester.pumpAndSettle();
  });
  testWidgets('account change immediately removes the old course snapshot', (
    tester,
  ) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await reveal(tester, 'Course');
    expect(find.text('Course'), findsOneWidget);
    final pending = Completer<EducationPagedResult<EducationCourse>>();
    repository.readCourses = (_, _, _) => pending.future;
    await tester.pumpApp(page(actor: 'next'));
    await tester.pump(const Duration(milliseconds: 1));
    expect(find.text('Course'), findsNothing);
    pending.complete(pageRows([course('Next course')]));
    await tester.pumpAndSettle();
  });
  testWidgets('near-end paging deduplicates rows and stops on an empty page', (
    tester,
  ) async {
    repository.readCourses = (_, p, _) async => switch (p) {
      1 => pageRows([course('One')], count: 30),
      2 => pageRows([course('One'), course('Two')], count: 30, page: 2),
      _ => pageRows([], count: 30, page: p),
    };
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await courses(tester);
    expect(find.text('One'), findsOneWidget);
    expect(find.text('Two'), findsOneWidget);
    expect(repository.requests.where((r) => r.$2 == 3), hasLength(1));
    expect(repository.requests.any((r) => r.$2 > 3), isFalse);
  });
  testWidgets('large course collections only build visible rows', (
    tester,
  ) async {
    repository.readCourses = (_, _, _) async =>
        pageRows(List.generate(500, (i) => course('Course $i')));
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await courses(tester);
    expect(find.text('Course 0'), findsOneWidget);
    expect(find.text('Course 499'), findsNothing);
  });
  for (final challenge in [
    const ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
    const ApiException(
      message: 'Verify',
      statusCode: 403,
      isVerificationRequired: true,
    ),
    const ApiException.transport(message: 'Offline'),
  ]) {
    testWidgets(
      '${challenge.message} retains existing courses during refresh',
      (tester) async {
        await tester.pumpApp(page());
        await tester.pumpAndSettle();
        await courses(tester);
        repository.readCourses = (_, _, _) async => throw challenge;
        await tester
            .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
            .onRefresh();
        await tester.pumpAndSettle();
        await reveal(tester, 'Course');
        expect(find.text('Course'), findsOneWidget);
      },
    );
  }
  testWidgets('definitive permission denial clears existing courses', (
    tester,
  ) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await courses(tester);
    repository.readCourses = (_, _, _) async =>
        throw const ApiException(message: 'Denied', statusCode: 403);
    await tester
        .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
        .onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Course'), findsNothing);
  });
  testWidgets('save failure remains in the author form and permits retry', (
    tester,
  ) async {
    repository.saveCourse = () async => throw const ApiException(
      message: 'Course permission rejected',
      statusCode: 403,
    );
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await courses(tester);
    tester
        .widget<ShellChromeActions>(find.byType(ShellChromeActions))
        .actions
        .singleWhere((a) => a.id == 'education-create')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'New course');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Course permission rejected'), findsOneWidget);
    expect(tester.takeException(), isNull);
    repository.saveCourse = () async {};
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Course permission rejected'), findsNothing);
  });
  testWidgets('departing the actor removes only its owned creation sheet', (
    tester,
  ) async {
    final actor = ValueNotifier('actor');
    await tester.pumpApp(
      ValueListenableBuilder<String>(
        valueListenable: actor,
        builder: (_, value, _) => page(actor: value),
      ),
    );
    await tester.pumpAndSettle();
    await courses(tester);
    tester
        .widget<ShellChromeActions>(find.byType(ShellChromeActions))
        .actions
        .singleWhere((a) => a.id == 'education-create')
        .onPressed!();
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNWidgets(2));
    actor.value = 'next';
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    actor.dispose();
  });
  testWidgets('dock search resets when switching sections', (tester) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await courses(tester);
    var actions = tester.widget<ShellChromeActions>(
      find.byType(ShellChromeActions),
    );
    actions.actions.singleWhere((a) => a.id == 'education-search').onPressed!();
    await tester.pump();
    actions = tester.widget<ShellChromeActions>(
      find.byType(ShellChromeActions),
    );
    final search = actions.actions.singleWhere(
      (a) => a.id == 'education-search',
    );
    expect(search.inDock, isTrue);
    search.searchController!.text = 'Specific';
    search.onSearchChanged!('Specific');
    await tester.pump(const Duration(milliseconds: 301));
    await tester.pumpAndSettle();
    expect(repository.requests.last.$3, 'Specific');
    final nav = tester.widget<ShellMiniNav>(find.byType(ShellMiniNav));
    nav.items
        .singleWhere((item) => item.id == 'education-library')
        .onPressed!();
    await tester.pumpAndSettle();
    actions = tester.widget<ShellChromeActions>(
      find.byType(ShellChromeActions),
    );
    expect(
      actions.actions
          .singleWhere((a) => a.id == 'education-search')
          .searchController,
      isNull,
    );
  });
}
