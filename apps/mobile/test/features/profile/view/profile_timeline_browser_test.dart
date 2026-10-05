import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';
import 'package:mobile/features/profile/view/profile_timeline_days.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/helpers.dart';

ProfileTimelineItem item(String id, DateTime date) => ProfileTimelineItem(
  id: id,
  type: 'task',
  createdAt: date,
  scope: 'personal',
  title: id,
);

Finder date(DateTime day) =>
    find.byKey(ValueKey('timeline-date-${day.toIso8601String()}'));

void main() {
  testWidgets('cold loading is announced without a visible refresh control', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpApp(
      ProfileTimelineBrowser(items: const [], loading: true, onOpen: (_) {}),
    );
    final loading = find.bySemanticsLabel('Loading');
    expect(loading, findsOneWidget);
    expect(
      tester
          .getSemantics(loading)
          .getSemanticsData()
          .flagsCollection
          .isLiveRegion,
      isTrue,
    );
    expect(find.text('Loading'), findsNothing);
    expect(find.byIcon(Icons.sync), findsNothing);
    handle.dispose();
  });

  testWidgets('untitled activity announces its milestone only once', (
    tester,
  ) async {
    await tester.pumpApp(
      ProfileTimelineDays(
        items: [
          ProfileTimelineItem(
            id: 'empty',
            type: 'task',
            createdAt: DateTime(2026, 10, 1, 15),
            scope: 'personal',
          ),
        ],
        onOpen: (_) {},
      ),
    );
    expect(
      find.descendant(
        of: find.byType(ListTile),
        matching: find.text('Created 1 task'),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Created 1 task ·'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final font = Platform.environment['TIMELINE_MATERIAL_FONT'];
    if (font != null) {
      final loader = FontLoader('Roboto')
        ..addFont(File(font).readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    for (final entry in manifest.cast<Map<String, dynamic>>()) {
      final loader = FontLoader(entry['family'] as String);
      for (final font
          in (entry['fonts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });

  final today = DateTime(2026, 10, 1, 12);
  final data = [
    item('October task', DateTime(2026, 10, 1, 10)),
    item('September task', DateTime(2026, 9, 28, 10)),
    item('Older task', DateTime(2026, 9, 20, 10)),
  ];

  ValueNotifier<Widget>? body;
  setUp(() => body = null);

  Future<void> mount(
    WidgetTester tester, {
    List<ProfileTimelineItem>? items,
    bool loading = false,
    bool refreshing = false,
    bool reduceMotion = false,
    double scale = 1,
    Key? scope,
    int pageSize = 5,
  }) async {
    final next = Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: reduceMotion,
          textScaler: TextScaler.linear(scale),
        ),
        child: SingleChildScrollView(
          child: ProfileTimelineBrowser(
            key: scope,
            now: today,
            items: items ?? data,
            loading: loading,
            refreshing: refreshing,
            pageSize: pageSize,
            onOpen: (_) {},
          ),
        ),
      ),
    );
    if (body == null) {
      body = ValueNotifier(next);
      addTearDown(body!.dispose);
      await tester.pumpApp(
        ValueListenableBuilder<Widget>(
          valueListenable: body!,
          builder: (_, child, _) => child,
        ),
      );
    } else {
      body!.value = next;
    }
    await tester.pumpAndSettle();
  }

  for (final entry in {
    ProfileTimelineAvailability.unavailable: 'Activity could not be refreshed.',
    ProfileTimelineAvailability.partial: 'Some activity is unavailable.',
  }.entries) {
    testWidgets('standalone browser reports ${entry.key.name} once', (
      tester,
    ) async {
      await tester.pumpApp(
        SingleChildScrollView(
          child: ProfileTimelineBrowser(
            items: const [],
            availability: entry.key,
            now: today,
            onOpen: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsOneWidget);
      expect(find.text('No recent activity in this workspace'), findsNothing);
      tester
          .widget<IconButton>(
            find.byKey(
              const ValueKey('timeline-date-toggle'),
              skipOffstage: false,
            ),
          )
          .onPressed!();
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsOneWidget);
      expect(find.text('No activity was returned for this day.'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'sparse agenda only includes returned days; date selection is accessible',
    (tester) async {
      await mount(tester);
      expect(find.text('October task'), findsOneWidget);
      expect(find.text('September task', skipOffstage: false), findsOneWidget);
      expect(find.text('Older task'), findsNothing);
      final semantics = tester.ensureSemantics();
      tester
          .widget<IconButton>(
            find.byKey(
              const ValueKey('timeline-date-toggle'),
              skipOffstage: false,
            ),
          )
          .onPressed!();
      await tester.pumpAndSettle();
      final selected = date(DateTime(2026, 10));
      expect(
        tester
            .getSemantics(selected)
            .getSemanticsData()
            .hasAction(ui.SemanticsAction.tap),
        isTrue,
      );
      await tester.tap(date(DateTime(2026, 9, 30)));
      await tester.pumpAndSettle();
      expect(
        find.text('No activity was returned for this day.'),
        findsOneWidget,
      );
      expect(find.text('October task'), findsOneWidget);
      for (var i = 0; i < 4; i++) {
        tester
            .widget<IconButton>(
              find.byKey(
                const ValueKey('timeline-date-toggle'),
                skipOffstage: false,
              ),
            )
            .onPressed!();
        await tester.pumpAndSettle();
      }
      expect(
        find.text('No activity was returned for this day.'),
        findsOneWidget,
      );
      semantics.dispose();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'mode transitions preserve current item pixels and fixed viewport',
    (tester) async {
      final dense = [
        for (var i = 0; i < 14; i++)
          item('Task $i', DateTime(2026, 10, 1, 12, -i)),
      ];
      await mount(tester, items: dense);
      final browserRect = tester.getRect(
        find.byKey(const ValueKey('timeline-browser')),
      );
      final browserScroll = find
          .descendant(
            of: find.byType(ProfileTimelineBrowser),
            matching: find.byType(CustomScrollView),
          )
          .last;
      await tester.drag(browserScroll, const Offset(0, -220));
      await tester.pumpAndSettle();
      final before = tester.getTopLeft(find.text('Task 2')).dy;
      for (var i = 0; i < 6; i++) {
        tester
            .widget<IconButton>(
              find.byKey(
                const ValueKey('timeline-date-toggle'),
                skipOffstage: false,
              ),
            )
            .onPressed!();
        await tester.pumpAndSettle();
        expect(
          tester.getRect(find.byKey(const ValueKey('timeline-browser'))),
          browserRect,
        );
        expect(tester.getTopLeft(find.text('Task 2')).dy, closeTo(before, .01));
      }
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'pagination appends returned days without moving rendered content',
    (tester) async {
      await mount(tester, pageSize: 2);
      expect(find.text('Older task'), findsNothing);
      await tester.ensureVisible(
        find.byKey(const ValueKey('timeline-more-days'), skipOffstage: false),
      );
      await tester.pumpAndSettle();
      final before = tester.getTopLeft(
        find.text('September task', skipOffstage: false),
      );
      // Scrolling near the action reveals the next page automatically.
      await tester.pump();
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('September task', skipOffstage: false)),
        before,
      );
      final scroll = tester.state<ScrollableState>(
        find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pumpAndSettle();
      expect(find.text('Older task'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('timeline-more-days'), skipOffstage: false),
        findsNothing,
      );
    },
  );

  testWidgets(
    'refresh retains date selection; cold load has the same browser geometry',
    (tester) async {
      await mount(
        tester,
        items: [],
        loading: true,
        scope: const ValueKey('owner'),
      );
      final cold = tester.getRect(
        find.byKey(const ValueKey('timeline-browser')),
      );
      await mount(tester, scope: const ValueKey('owner'));
      expect(
        tester.getRect(find.byKey(const ValueKey('timeline-browser'))),
        cold,
      );
      tester
          .widget<IconButton>(
            find.byKey(
              const ValueKey('timeline-date-toggle'),
              skipOffstage: false,
            ),
          )
          .onPressed!();
      await tester.pumpAndSettle();
      await tester.tap(date(DateTime(2026, 9, 30)));
      await tester.pumpAndSettle();
      await mount(tester, refreshing: true, scope: const ValueKey('owner'));
      expect(
        find.text('No activity was returned for this day.'),
        findsOneWidget,
      );
      expect(
        tester.getRect(find.byKey(const ValueKey('timeline-browser'))),
        cold,
      );
      await mount(
        tester,
        items: [item('Other owner', today)],
        scope: const ValueKey('other-owner'),
      );
      expect(find.text('Other owner'), findsOneWidget);
      expect(find.text('No activity was returned for this day.'), findsNothing);
      expect(find.text('Days with activity'), findsOneWidget);
    },
  );

  testWidgets(
    'reduced motion and double text keep controls usable without overflow',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await mount(tester, reduceMotion: true, scale: 2);
      tester
          .widget<IconButton>(
            find.byKey(
              const ValueKey('timeline-date-toggle'),
              skipOffstage: false,
            ),
          )
          .onPressed!();
      await tester.pump();
      expect(find.text('October task'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('capture bounded sparse agenda, selected day and empty day', (
    tester,
  ) async {
    final output = Platform.environment['TIMELINE_RENDER_DIR'];
    if (output == null) return;
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      shad.Theme(
        data: MobileShadTheme.light,
        child: RepaintBoundary(
          key: const ValueKey('timeline-capture'),
          child: DefaultTextStyle.merge(
            style: const TextStyle(fontFamily: 'Roboto'),
            child: ColoredBox(
              color: MobileShadTheme.light.colorScheme.background,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ProfileTimelineBrowser(
                  items: data,
                  now: today,
                  onOpen: (_) {},
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    Future<void> capture(String name) async {
      await tester.pump(const Duration(milliseconds: 200));
      final bounds = tester.getRect(
        find.byKey(const ValueKey('timeline-browser')),
      );
      final titleBounds = name == 'empty-day'
          ? null
          : tester.getRect(find.text('October task'));
      await tester
          .runAsync(() async {
            final directory = Directory(output)..createSync(recursive: true);
            final boundary = tester.renderObject<RenderRepaintBoundary>(
              find.byKey(const ValueKey('timeline-capture')),
            );
            final image = await boundary.toImage();
            try {
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final codec = await ui.instantiateImageCodec(
                bytes!.buffer.asUint8List(),
              );
              final frame = await codec.getNextFrame();
              var ink = 0;
              try {
                if (titleBounds != null) {
                  final pixels = await frame.image.toByteData();
                  for (
                    var y = titleBounds.top.floor();
                    y < titleBounds.bottom.ceil();
                    y++
                  ) {
                    for (
                      var x = titleBounds.left.floor();
                      x < titleBounds.right.ceil();
                      x++
                    ) {
                      final offset = (y * frame.image.width + x) * 4;
                      if (pixels!.getUint8(offset) < 100 &&
                          pixels.getUint8(offset + 1) < 100 &&
                          pixels.getUint8(offset + 2) < 100) {
                        ink++;
                      }
                    }
                  }
                }
              } finally {
                frame.image.dispose();
                codec.dispose();
              }
              await File(
                '${directory.path}/$name.png',
              ).writeAsBytes(bytes.buffer.asUint8List());
              await File('${directory.path}/$name.json').writeAsString(
                jsonEncode({
                  'synthetic': true,
                  'realMobileTheme': true,
                  'titleBounds': titleBounds?.toString(),
                  'titleInkPixels': ink,
                  'browser': [
                    bounds.left,
                    bounds.top,
                    bounds.right,
                    bounds.bottom,
                  ],
                }),
              );
              if (titleBounds != null) {
                expect(
                  ink,
                  greaterThan(20),
                  reason: 'Saved PNG must show the visible activity title',
                );
              }
            } finally {
              image.dispose();
            }
          })
          .timeout(const Duration(seconds: 10));
    }

    await capture('agenda');
    tester
        .widget<IconButton>(
          find.byKey(
            const ValueKey('timeline-date-toggle'),
            skipOffstage: false,
          ),
        )
        .onPressed!();
    await tester.pumpAndSettle();
    await capture('selected-day');
    await tester.tap(date(DateTime(2026, 9, 30)));
    await tester.pumpAndSettle();
    await capture('empty-day');
    expect(tester.takeException(), isNull);
  });

  test('real IANA zones group UTC boundaries and DST by calendar day', () {
    tzdata.initializeTimeZones();
    final saigon = tz.getLocation('Asia/Ho_Chi_Minh');
    final ny = tz.getLocation('America/New_York');
    DateTime vietnam(DateTime value) => tz.TZDateTime.from(value, saigon);
    DateTime newYork(DateTime value) => tz.TZDateTime.from(value, ny);
    final source = [
      item('UTC evening', DateTime.utc(2026, 9, 30, 18)),
      item('UTC morning', DateTime.utc(2026, 10, 1, 1)),
    ];
    expect(groupProfileTimelineDays(source, convertDate: vietnam).keys, [
      DateTime(2026, 10),
    ]);
    expect(groupProfileTimelineDays(source, convertDate: newYork).keys, [
      DateTime(2026, 9, 30),
    ]);
    final dst = [
      item('first 1:30', DateTime.utc(2026, 11, 1, 5, 30)),
      item('second 1:30', DateTime.utc(2026, 11, 1, 6, 30)),
    ];
    final days = groupProfileTimelineDays(dst, convertDate: newYork);
    expect(days.keys, [DateTime(2026, 11)]);
    expect(days.values.single.map((row) => row.id), [
      'second 1:30',
      'first 1:30',
    ]);
  });
}
