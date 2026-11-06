import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/features/mastermind/machines/machine_detail.dart';
import 'package:mobile/features/mastermind/machines/machine_list.dart';
import 'package:mobile/features/mastermind/machines/machine_parser.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/design_render_harness.dart';

final now = DateTime.utc(2026, 10, 29, 4);
Future<void> pump(
  WidgetTester tester,
  Widget child, {
  String locale = 'en',
  bool dark = false,
  double scale = 2,
  Size size = const Size(320, 900),
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(
    MaterialApp(
      locale: Locale(locale),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: AppearanceTheme.materialTheme(
        const AppearanceSettings(),
        dark ? Brightness.dark : Brightness.light,
      ),
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: RepaintBoundary(
              key: const Key('capture'),
              child: SingleChildScrollView(child: child),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> noLeaks(WidgetTester tester) async {
  final text = tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? '')
      .join(' ');
  for (final secret in [
    'skr-sonha',
    'secret-host',
    '192.0.2.1',
    '/Users/secret',
  ]) {
    expect(text, isNot(contains(secret)));
  }
  expect(tester.takeException(), isNull);
}

void main() {
  setUpAll(DesignRender.loadFonts);
  setUp(() => machineSampleEnabled.value = false);
  for (final locale in ['en', 'vi']) {
    testWidgets('machine states $locale at 320 / 2x', (tester) async {
      final vi = locale == 'vi';
      await pump(
        tester,
        MachineList(snapshot: const MachineSnapshot(), now: now),
        locale: locale,
      );
      expect(
        find.text(
          vi
              ? 'Dữ liệu máy chưa được công bố'
              : 'Machine data is not published yet',
        ),
        findsOneWidget,
      );
      await pump(
        tester,
        MachineList(
          snapshot: const MachineSnapshot(machines: []),
          now: now,
        ),
        locale: locale,
      );
      expect(
        find.text(vi ? 'Chưa có máy nào được báo cáo' : 'No machines reported'),
        findsOneWidget,
      );
      final data = parseMachineSnapshot(machineSample);
      await pump(
        tester,
        MachineList(snapshot: data, now: now.add(const Duration(hours: 1))),
        locale: locale,
      );
      expect(
        find.textContaining(
          vi ? 'Dữ liệu thu thập đã cũ' : 'Collector data is stale',
        ),
        findsOneWidget,
      );
      expect(
        find.text(vi ? 'Giá trị gần nhất' : 'Last-known values'),
        findsOneWidget,
      );
      expect(
        find.textContaining(vi ? 'Không khả dụng' : 'Unavailable'),
        findsWidgets,
      );
      await noLeaks(tester);
    });
  }
  for (final locale in ['en', 'vi']) {
    for (final dark in [false, true]) {
      testWidgets(
        'detail sections and chart tables $locale dark=$dark at 320 / 2x',
        (tester) async {
          final data = parseMachineSnapshot(machineSample);
          await pump(
            tester,
            MachineDetail(
              machine: data.machines!.first,
              snapshot: data,
              now: now,
            ),
            locale: locale,
            dark: dark,
          );
          for (final title
              in locale == 'en'
                  ? [
                      'Now',
                      'Running',
                      'Rules',
                      'Alerts',
                      'History',
                      'Keep awake',
                    ]
                  : [
                      'Hiện tại',
                      'Đang chạy',
                      'Quy tắc',
                      'Cảnh báo',
                      'Lịch sử',
                      'Giữ máy thức',
                    ]) {
            expect(find.text(title), findsWidgets);
          }
          await noLeaks(tester);
          final table = find.text(locale == 'en' ? 'Table' : 'Bảng');
          await tester.ensureVisible(table);
          await tester.tap(table);
          await tester.pumpAndSettle();
          expect(find.textContaining('34'), findsWidgets);
          await noLeaks(tester);
        },
      );
    }
  }
  testWidgets(
    'hostile fixture never renders aliases and production is read-only',
    (tester) async {
      final root =
          jsonDecode(
                File(
                  'test/fixtures/mastermind_machines_sample.json',
                ).readAsStringSync(),
              )
              as Map<String, dynamic>;
      final data = parseMachineSnapshot(root);
      await pump(tester, MachineList(snapshot: data, now: now));
      await noLeaks(tester);
      expect(find.text('SSET Mac Studio'), findsOneWidget);
      await pump(
        tester,
        MachineDetail(machine: data.machines![2], snapshot: data, now: now),
      );
      expect(find.text('Production host: read-only'), findsWidgets);
      expect(find.text('Drain'), findsNothing);
      expect(find.text('Pause scheduling'), findsNothing);
    },
  );
  testWidgets('Home Machines row only with alerts; sample toggle is explicit', (
    tester,
  ) async {
    await pump(tester, const HomeMachinesRow(snapshot: MachineSnapshot()));
    expect(find.text('Machines'), findsNothing);
    await pump(
      tester,
      HomeMachinesRow(snapshot: parseMachineSnapshot(machineSample)),
    );
    expect(find.text('Machines'), findsOneWidget);
    await pump(
      tester,
      MachineList(snapshot: const MachineSnapshot(), now: now),
    );
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    expect(find.text('SAMPLE data'), findsOneWidget);
    expect(find.text('SSET Mac Studio'), findsOneWidget);
  });
  testWidgets('loading uses existing shell skeleton', (tester) async {
    await pump(
      tester,
      const SizedBox(height: 900, child: MastermindSkeleton()),
    );
    expect(tester.takeException(), isNull);
  });
  for (final variant in ['list-dark', 'list-light', 'detail-dark']) {
    testWidgets('optional widget screenshot $variant', (tester) async {
      final data = parseMachineSnapshot(machineSample);
      await pump(
        tester,
        variant == 'detail-dark'
            ? MachineDetail(
                machine: data.machines!.first,
                snapshot: data,
                now: now,
              )
            : MachineList(snapshot: data, now: now),
        dark: variant != 'list-light',
        scale: 1,
        size: const Size(430, 2400),
      );
      if (Platform.environment['MACHINE_SCREENSHOTS'] case final path?) {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(const Key('capture')),
        );
        await tester.runAsync(() async {
          final img = await boundary.toImage();
          final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
          await Directory(path).create(recursive: true);
          await File(
            '$path/machines-$variant.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          img.dispose();
        });
      }
    });
  }
}
