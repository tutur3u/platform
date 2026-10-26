part of 'appearance_root_tabs_render_test.dart';

class _Tasks extends MockCubit<TaskListState> implements TaskListCubit {}

class _Calendar extends MockCubit<CalendarState> implements CalendarCubit {}

TaskListInfo _list(String board, String list) => TaskListInfo(
  id: 'list-$list',
  name: list,
  board: TaskBoardInfo(id: 'board-$board', name: board),
);

/// Home under the real shell with fixture data: phone, tablet and desktop in
/// Classic light/dark, a gradient and a blob theme. Captures are written
/// only when `SETTINGS_RENDER_DIR` is set; layout assertions always run.
void _homeRenderCases() {
  for (final size in renderSizes.entries) {
    for (final look in renderAppearances.entries) {
      testWidgets('Home renders on ${size.key} in ${look.key}', (tester) async {
        final now = DateTime.now();
        final today = DateTime(now.year, now.month, now.day, 17);
        final tasks = _Tasks();
        final calendar = _Calendar();
        whenListen(
          tasks,
          const Stream<TaskListState>.empty(),
          initialState: TaskListState(
            status: TaskListStatus.loaded,
            hasLoadedOnce: true,
            totalActiveTasks: 7,
            overdueTasks: [
              UserTask(
                id: 't1',
                name: 'Send the Q4 venue shortlist',
                endDate: today.subtract(const Duration(days: 2)),
                list: _list('Offsite', 'Planning'),
              ),
            ],
            todayTasks: [
              UserTask(
                id: 't2',
                name: 'Review onboarding copy for the mobile release',
                endDate: today,
                list: _list('Product', 'In review'),
              ),
            ],
            upcomingTasks: [
              UserTask(
                id: 't3',
                name: 'Prepare design critique notes',
                endDate: today.add(const Duration(days: 3)),
                list: _list('Design', 'Backlog'),
              ),
            ],
          ),
        );
        whenListen(
          calendar,
          const Stream<CalendarState>.empty(),
          initialState: CalendarState(
            status: CalendarStatus.loaded,
            hasLoadedOnce: true,
            events: [
              for (final (offset, title, note) in [
                (const Duration(hours: 26), 'Design sync', 'Weekly review'),
                (const Duration(days: 2, hours: 3), 'Customer call', ''),
                (const Duration(days: 4), 'Sprint planning', 'Room 4B'),
              ])
                CalendarEvent(
                  id: title,
                  title: title,
                  description: note,
                  startAt: now.add(offset),
                  endAt: now.add(offset + const Duration(hours: 1)),
                ),
            ],
          ),
        );
        addTearDown(() async {
          await tasks.close();
          await calendar.close();
        });

        await pumpShellRender(
          tester,
          location: Routes.home,
          size: size.value,
          appearance: look.value.$1,
          themeMode: look.value.$2,
          // The finance preview needs a signed-in user; keep the fixture to
          // the widgets it can fill.
          preferences: const {
            'home-widgets-hidden': ['finance'],
          },
          homePageBuilder: (token) => HomePage(
            replayToken: token,
            taskListCubit: tasks,
            calendarCubit: calendar,
          ),
        );

        expect(find.byType(DashboardPage), findsOneWidget);
        expect(find.text('Send the Q4 venue shortlist'), findsOneWidget);
        expect(find.text('Design sync'), findsOneWidget);
        final cards = find.byType(AppGroupedCard);
        // Today, Up next, Calendar and today's summary.
        expect(cards, findsNWidgets(4));
        final lefts = {
          for (final element in cards.evaluate())
            tester.getTopLeft(find.byWidget(element.widget)).dx,
        };
        if (size.key == 'phone') {
          // One column on the standard 16dp gutter.
          expect(lefts, {AppLayout.gutter(DeviceClass.compact)});
          expect(
            tester.getTopRight(cards.first).dx,
            size.value.width - AppLayout.gutter(DeviceClass.compact),
          );
        } else {
          // Tablets and desktops lay the widgets out in columns.
          expect(lefts.length, greaterThan(1));
        }
        for (final key in [
          'home-workspace-chip-${renderWorkspace.id}',
          'home-workspace-chip-more',
        ]) {
          expect(
            tester.getSize(find.byKey(ValueKey(key))).height,
            greaterThanOrEqualTo(44),
            reason: key,
          );
        }
        await _capture(tester, 'home-${size.key}-${look.key}');
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final look in ['classic-light', 'classic-dark']) {
    testWidgets('Home loading and error states render in $look', (
      tester,
    ) async {
      final tasks = _Tasks();
      final calendar = _Calendar();
      whenListen(
        tasks,
        const Stream<TaskListState>.empty(),
        initialState: const TaskListState(status: TaskListStatus.loading),
      );
      whenListen(
        calendar,
        const Stream<CalendarState>.empty(),
        initialState: const CalendarState(status: CalendarStatus.error),
      );
      addTearDown(() async {
        await tasks.close();
        await calendar.close();
      });
      final appearance = renderAppearances[look]!;
      await pumpShellRender(
        tester,
        location: Routes.home,
        size: renderSizes['phone']!,
        appearance: appearance.$1,
        themeMode: appearance.$2,
        preferences: const {
          'home-widgets-hidden': ['finance'],
        },
        homePageBuilder: (token) => HomePage(
          replayToken: token,
          taskListCubit: tasks,
          calendarCubit: calendar,
        ),
      );

      // Today and Up next both wait on the task load.
      expect(find.byType(AppSkeletonRows), findsNWidgets(2));
      expect(find.text('Pull down to try again.'), findsOneWidget);
      await _capture(tester, 'home-phone-$look-states');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Home controls are activatable by screen readers', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final tasks = _Tasks();
    final calendar = _Calendar();
    whenListen(
      tasks,
      const Stream<TaskListState>.empty(),
      initialState: const TaskListState(
        status: TaskListStatus.loaded,
        hasLoadedOnce: true,
      ),
    );
    whenListen(
      calendar,
      const Stream<CalendarState>.empty(),
      initialState: const CalendarState(
        status: CalendarStatus.loaded,
        hasLoadedOnce: true,
      ),
    );
    addTearDown(() async {
      await tasks.close();
      await calendar.close();
    });
    final appearance = renderAppearances['classic-light']!;
    final router = await pumpShellRender(
      tester,
      location: Routes.home,
      size: renderSizes['phone']!,
      appearance: appearance.$1,
      themeMode: appearance.$2,
      preferences: const {
        'home-widgets-hidden': ['finance'],
      },
      extraLocations: const [Routes.tasks],
      homePageBuilder: (token) => HomePage(
        replayToken: token,
        taskListCubit: tasks,
        calendarCubit: calendar,
      ),
    );

    for (final label in ['More', 'See all Today']) {
      final data = tester
          .getSemantics(find.bySemanticsLabel(label))
          .getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isTrue, reason: label);
      expect(data.flagsCollection.isButton, isTrue, reason: label);
    }

    // Screen-reader activation (not a pointer tap) opens the More menu...
    tester.semantics.tap(find.semantics.byLabel('More'));
    await settleShell(tester);
    expect(find.byType(AppSheetScaffold), findsOneWidget);
    Navigator.of(tester.element(find.byType(AppSheetScaffold))).pop();
    await settleShell(tester);

    // ...and the section link navigates.
    tester.semantics.tap(find.semantics.byLabel('See all Today'));
    await settleShell(tester);
    expect(router.routerDelegate.currentConfiguration.uri.path, Routes.tasks);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
