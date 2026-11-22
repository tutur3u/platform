// On-device Mail benchmark: inbox scroll, thread open and thread scroll.
//
// Run in profile mode on a device or emulator (never debug mode, whose JIT
// frame times are not comparable):
//   flutter drive --profile --flavor development \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/perf/mail_benchmark_test.dart -d <id>
//
// The real Mail workspace runs against a synthetic in-memory repository, so
// nothing touches the network and nothing resembles real mail. Each scenario
// prints one `MAIL_BENCH` JSON line with build and raster percentiles, jank
// counts, time to first content and resident memory. Compare rounds of the
// same scenario across commits on the same device.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements MailRepository {}

const _threads = 300;
const _box = 'bench-box';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized()
    ..framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  final report = <String, Object?>{};
  tearDownAll(() => binding.reportData = {'mail_bench': report});

  for (var round = 1; round <= 3; round++) {
    testWidgets('mail r$round', (tester) async {
      final rssStart = ProcessInfo.currentRss;
      final repository = _stub(_Repository());
      await tester.pumpWidget(
        _App(
          child: MailWorkspace(workspaceId: 'bench', repository: repository),
        ),
      );
      await _settle(tester, const Duration(seconds: 2));
      final rssInbox = ProcessInfo.currentRss;

      final list = find.byType(Scrollable).first;
      final inbox = await _frames(tester, () async {
        for (var i = 0; i < 4; i++) {
          await tester.fling(list, const Offset(0, -900), 2600);
          await _settle(tester, const Duration(milliseconds: 900));
          await tester.fling(list, const Offset(0, 900), 2600);
          await _settle(tester, const Duration(milliseconds: 900));
        }
      });

      // Open the third row: a three-message thread whose latest message is a
      // long table newsletter.
      final subject = _subject(2);
      final open = Stopwatch()..start();
      await tester.tap(find.text(subject).first);
      Duration? firstContent;
      Duration? body;
      final reader = find.byType(MailReader);
      while (open.elapsed < const Duration(seconds: 10) && body == null) {
        await tester.pump();
        firstContent ??=
            find
                .descendant(of: reader, matching: find.text(subject))
                .hitTestable()
                .evaluate()
                .isNotEmpty
            ? open.elapsed
            : null;
        if (find.byType(InAppWebView).evaluate().isNotEmpty) {
          body = open.elapsed;
        }
      }
      await _settle(tester, const Duration(seconds: 2));
      final rssThread = ProcessInfo.currentRss;

      final readerScroll = find
          .descendant(of: reader, matching: find.byType(Scrollable))
          .first;
      final thread = await _frames(tester, () async {
        for (var i = 0; i < 3; i++) {
          await tester.fling(readerScroll, const Offset(0, -700), 2200);
          await _settle(tester, const Duration(milliseconds: 900));
          await tester.fling(readerScroll, const Offset(0, 700), 2200);
          await _settle(tester, const Duration(milliseconds: 900));
        }
      });

      final result = {
        'round': round,
        'inboxScroll': inbox,
        'threadScroll': thread,
        'threadOpen': {
          'firstContentMs': firstContent?.inMilliseconds,
          'bodyMs': body?.inMilliseconds,
        },
        'rssMb': {
          'start': _mb(rssStart),
          'inbox': _mb(rssInbox),
          'thread': _mb(rssThread),
          'max': _mb(ProcessInfo.maxRss),
        },
      };
      report['r$round'] = result;
      debugPrint('MAIL_BENCH ${jsonEncode(result)}');
      await tester.pumpWidget(const SizedBox.shrink());
      await _settle(tester, const Duration(seconds: 1));
    });
  }
}

double _mb(int bytes) => (bytes / (1024 * 1024) * 10).roundToDouble() / 10;

Future<void> _settle(WidgetTester tester, Duration duration) async {
  final end = DateTime.now().add(duration);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Frame build and raster percentiles (ms) while [interaction] runs.
Future<Map<String, Object>> _frames(
  WidgetTester tester,
  Future<void> Function() interaction,
) async {
  final timings = <FrameTiming>[];
  void collect(List<FrameTiming> batch) => timings.addAll(batch);
  SchedulerBinding.instance.addTimingsCallback(collect);
  await interaction();
  await tester.pump(const Duration(milliseconds: 1200));
  SchedulerBinding.instance.removeTimingsCallback(collect);
  double ms(Duration d) => d.inMicroseconds / 1000;
  final build = timings.map((t) => ms(t.buildDuration)).toList()..sort();
  final raster = timings.map((t) => ms(t.rasterDuration)).toList()..sort();
  final total = timings.map((t) => ms(t.totalSpan)).toList()..sort();
  double pct(List<double> values, double p) => values.isEmpty
      ? 0
      : values[math.min(values.length - 1, (values.length * p).floor())];
  double round(double v) => (v * 100).roundToDouble() / 100;
  return {
    'frames': timings.length,
    'buildP50': round(pct(build, 0.5)),
    'buildP90': round(pct(build, 0.9)),
    'buildP99': round(pct(build, 0.99)),
    'rasterP50': round(pct(raster, 0.5)),
    'rasterP90': round(pct(raster, 0.9)),
    'rasterP99': round(pct(raster, 0.99)),
    'jank16': total.where((v) => v > 16.7).length,
    'jank33': total.where((v) => v > 33.4).length,
  };
}

String _subject(int i) =>
    'Synthetic weekly update $i: release notes, schedule changes and '
    'follow-ups for the team';

Map<String, dynamic> _row(int i) => {
  'id': 'thread-$i',
  'subject': _subject(i),
  'participants': [
    {'displayName': 'Sender $i', 'address': 'sender$i@example.invalid'},
    if (i.isEven)
      {'displayName': 'Teammate $i', 'address': 'mate$i@example.invalid'},
  ],
  'latestSnippet':
      'Synthetic snippet $i with enough text to wrap onto a second line in '
      'the inbox so row layout does real work.',
  'unreadCount': i % 3 == 0 ? 1 : 0,
  'starred': i % 7 == 0,
  'hasAttachments': i % 5 == 0,
  'labels': [
    if (i % 4 == 0) {'id': 'updates', 'name': 'Updates'},
  ],
  'lastMessageAt': DateTime.utc(
    2026,
    11,
    22,
    9,
  ).subtract(Duration(hours: i * 3)).toIso8601String(),
};

String _newsletter(int i) {
  final sections = StringBuffer();
  for (var s = 0; s < 40; s++) {
    sections.write('''
<tr><td style="padding:24px 32px;font-size:16px;line-height:24px">
<h2 style="font-size:22px;margin:0 0 8px">Section $s of update $i</h2>
<img src="https://example.invalid/banner-$s.png" width="536" height="180" alt="banner">
<p>Synthetic paragraph $s. ${'Lorem text for layout only. ' * 6}</p>
<table width="536" style="width:536px"><tr>
<td width="268"><a href="https://example.invalid/a$s">Open item $s</a></td>
<td width="268" style="text-align:right">Status: <b>ready</b></td>
</tr></table>
</td></tr>''');
  }
  const open =
      '<table width="600" style="width:600px;margin:0 auto" '
      'cellpadding="0" cellspacing="0">';
  const bar = '<tr><td style="background:#f38020; height:6px"></td></tr>';
  return '$open$bar$sections</table>';
}

Map<String, dynamic> _detail(String id) {
  final i = int.parse(id.split('-').last);
  Map<String, dynamic> message(int n, {bool latest = false}) => {
    'id': 'message-$i-$n',
    'fromName': 'Sender $i',
    'fromAddress': 'sender$i@example.invalid',
    'snippet': 'Message $n of thread $i',
    'bodyText': 'Message $n of thread $i',
    if (latest) 'bodyHtml': _newsletter(i),
    'direction': 'inbound',
    'sentAt': DateTime.utc(2026, 11, 22, 9 - n).toIso8601String(),
    'attachments': <dynamic>[],
    'recipients': [
      {'kind': 'to', 'address': 'bench@example.invalid'},
    ],
  };
  return {
    'thread': {
      'id': id,
      'subject': _subject(i),
      'labels': [
        {'id': 'updates', 'name': 'Updates'},
      ],
    },
    'messages': [message(1), message(2), message(3, latest: true)],
  };
}

MailRepository _stub(_Repository repository) {
  SharedPreferences.setMockInitialValues({});
  when(() => repository.cachedThread(any(), any(), any())).thenAnswer(
    (invocation) async => _detail(invocation.positionalArguments[2] as String),
  );
  when(() => repository.savedView(any())).thenAnswer((_) async => null);
  when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
  when(() => repository.accessRevoked).thenReturn(null);
  when(() => repository.bootstrap(any())).thenAnswer(
    (_) async => {
      'mailboxes': [
        {
          'id': _box,
          'address': 'bench@example.invalid',
          'status': 'active',
          'role': 'owner',
        },
      ],
    },
  );
  when(() => repository.organization(any(), any())).thenAnswer((_) async => {});
  when(
    () => repository.list(
      any(),
      any(),
      folder: any(named: 'folder'),
      query: any(named: 'query'),
      page: any(named: 'page'),
      label: any(named: 'label'),
      folderId: any(named: 'folderId'),
      forceRefresh: any(named: 'forceRefresh'),
    ),
  ).thenAnswer(
    (_) async => {
      'threads': [for (var i = 0; i < _threads; i++) _row(i)],
      'pagination': {'hasMore': false},
    },
  );
  when(
    () => repository.detail(any(), any(), any(), thread: any(named: 'thread')),
  ).thenAnswer(
    (invocation) async => _detail(invocation.positionalArguments[2] as String),
  );
  when(() => repository.refreshThread(any(), any(), any())).thenAnswer(
    (invocation) async => _detail(invocation.positionalArguments[2] as String),
  );
  when(
    () => repository.changeState(
      any(),
      any(),
      any(),
      any(),
      thread: any(named: 'thread'),
      snoozedUntil: any(named: 'snoozedUntil'),
    ),
  ).thenAnswer((_) async {});
  return repository;
}

class _App extends StatelessWidget {
  const _App({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => shad.ShadcnApp.router(
    debugShowCheckedModeBanner: false,
    themeMode: shad.ThemeMode.dark,
    theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
    darkTheme: const shad.ThemeData.dark(
      colorScheme: shad.ColorSchemes.darkZinc,
    ),
    localizationsDelegates: const [
      ...AppLocalizations.localizationsDelegates,
      AppShadcnLocalizationsDelegate(),
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    routerConfig: GoRouter(
      initialLocation: '/mail',
      routes: [
        GoRoute(
          path: '/mail',
          builder: (context, state) => shad.DrawerOverlay(child: child),
        ),
      ],
    ),
    builder: ShadcnMaterialBridge.appBuilder,
  );
}
