part of 'appearance_root_tabs_render_test.dart';

class _Tasks extends MockCubit<TaskListState> implements TaskListCubit {}

class _Calendar extends MockCubit<CalendarState> implements CalendarCubit {}

TaskListInfo _list(String board, String list) => TaskListInfo(
  id: 'list-$list',
  name: list,
  board: TaskBoardInfo(id: 'board-$board', name: board),
);

/// Home sizes: the shared phone, portrait tablet and laptop, plus a
/// landscape iPad (icon rail) and a wide desktop (sidebar, 1600dp canvas).
final _homeRenderSizes = <String, Size>{
  ...renderSizes,
  'tablet-landscape': const Size(1180, 820),
  'wide': const Size(1920, 1080),
};

/// Grid columns each Home size shows for its three grid cards (Today, Up
/// next, Calendar): one on phones, two on portrait tablets, three beside
/// the rail or sidebar.
int _homeColumns(String size) => switch (size) {
  'phone' => 1,
  'tablet' => 2,
  _ => 3,
};

/// Home under the real shell with fixture data: phone, tablets, laptop and a
/// wide desktop in Classic light/dark, a gradient and a blob theme. Captures
/// are written only when `SETTINGS_RENDER_DIR` is set; layout assertions
/// always run.
void _homeRenderCases() {
  testWidgets('Home can select a workspace from its empty state', (
    tester,
  ) async {
    await pumpShellRender(
      tester,
      location: Routes.home,
      size: renderSizes['phone']!,
      appearance: const AppearanceSettings(),
      themeMode: shad.ThemeMode.light,
      workspaceState: const WorkspaceState(status: WorkspaceStatus.loaded),
    );
    final l10n = tester.element(find.byType(HomePage)).l10n;
    expect(find.text(l10n.workspaceSelectEmpty), findsOneWidget);
    await tester.tap(find.text(l10n.workspaceSelectTitle));
    await settleShell(tester);
    expect(find.byType(AppSheetScaffold), findsOneWidget);
  });

  for (final size in _homeRenderSizes.entries) {
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
          // Tablets and desktops lay the widgets out in balanced columns,
          // with Today at a glance as a KPI strip above them.
          final strip = find.ancestor(
            of: find.byKey(const ValueKey('home-metric-active')),
            matching: find.byType(AppGroupedCard),
          );
          final today = tester.getRect(
            find.byKey(const ValueKey('home-widget-tasks')),
          );
          expect(tester.getRect(strip).bottom, lessThan(today.top));
          expect(tester.getRect(strip).left, today.left);
          expect(lefts.length, _homeColumns(size.key));
        }
        expect(
          tester.getSize(find.byType(ShellWorkspacePicker)).height,
          greaterThanOrEqualTo(44),
        );
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
      // A failed card names what failed and offers Retry; it never asks
      // for a pull gesture that desktops and keyboards do not have.
      expect(find.text("Couldn't load Calendar"), findsOneWidget);
      expect(
        find.text('Your data is safe. Try again in a moment.'),
        findsOneWidget,
      );
      expect(find.textContaining('Pull down'), findsNothing);
      await _capture(tester, 'home-phone-$look-states');
      when(
        () => calendar.loadEvents(
          any(),
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer((_) async {});
      await tester.ensureVisible(find.text('Retry'));
      await tester.tap(find.text('Retry'));
      verify(() => calendar.loadEvents(any(), forceRefresh: true)).called(1);
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

    // The workspace header and the Home section link both accept a screen
    // reader's tap action.
    final workspace = find.descendant(
      of: find.byType(ShellWorkspacePicker),
      matching: find.bySemanticsLabel(renderWorkspace.name!),
    );
    final section = find.descendant(
      of: find.byType(HomePage),
      matching: find.bySemanticsLabel('See all Today'),
    );
    for (final control in [workspace, section]) {
      final data = tester.getSemantics(control).getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isTrue);
      expect(data.flagsCollection.isButton, isTrue);
    }

    final workspaceNode = tester.getSemantics(workspace).id;
    tester.semantics.tap(
      find.semantics.byPredicate((node) => node.id == workspaceNode),
    );
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

  testWidgets('Home metrics open their lists by pointer and screen reader', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final now = DateTime.now();
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
            name: 'Synthetic overdue task',
            endDate: now.subtract(const Duration(days: 2)),
            list: _list('Offsite', 'Planning'),
          ),
        ],
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
      // Only the summary, so every metric is on screen.
      preferences: const {
        'home-widgets-hidden': [
          'tasks',
          'calendar',
          'mail',
          'meet',
          'finance',
          'notes',
        ],
      },
      extraLocations: const [Routes.tasks, Routes.calendar],
      homePageBuilder: (token) => HomePage(
        replayToken: token,
        taskListCubit: tasks,
        calendarCubit: calendar,
      ),
    );
    String path() => router.routerDelegate.currentConfiguration.uri.path;
    Future<void> home() async {
      router.go(Routes.home);
      await settleShell(tester);
    }

    for (final (key, label, target) in [
      ('home-metric-active', 'Active tasks: 7', Routes.tasks),
      ('home-metric-overdue', 'Overdue: 1', Routes.tasks),
      ('home-metric-events', 'Upcoming events: 0', Routes.calendar),
    ]) {
      final data = tester
          .getSemantics(find.bySemanticsLabel(label))
          .getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isTrue, reason: label);
      expect(data.flagsCollection.isButton, isTrue, reason: label);

      // Screen-reader activation, not a pointer tap.
      tester.semantics.tap(find.semantics.byLabel(label));
      await settleShell(tester);
      expect(path(), target, reason: label);
      await home();

      await tester.tap(find.byKey(ValueKey(key)));
      await settleShell(tester);
      expect(path(), target, reason: key);
      await home();
    }
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
