import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_startup_timings.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_info_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_startup_diagnostics.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const Map<AssistantLiveStartupPhase, int> _all = {
  AssistantLiveStartupPhase.total: 250,
  AssistantLiveStartupPhase.ready: 50,
  AssistantLiveStartupPhase.socket: 40,
  AssistantLiveStartupPhase.audio: 80,
  AssistantLiveStartupPhase.history: 70,
  AssistantLiveStartupPhase.token: 30,
};

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: shad.Theme(
    data: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
    child: Scaffold(body: child),
  ),
);

void main() {
  testWidgets('no timings means no diagnostic heading or fabricated values', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(const AssistantLiveStartupDiagnostics(timings: {})),
    );
    await tester.pumpAndSettle();
    expect(find.text('Last connection attempt'), findsNothing);
    expect(find.textContaining('ms'), findsNothing);
  });

  testWidgets('phases use fixed order and preserve overlapping total', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(const AssistantLiveStartupDiagnostics(timings: _all)),
    );
    await tester.pumpAndSettle();
    var previousY = -1.0;
    for (final phase in AssistantLiveStartupPhase.values) {
      final row = find.byKey(ValueKey('live-startup-${phase.name}'));
      final y = tester.getTopLeft(row).dy;
      expect(y, greaterThan(previousY));
      previousY = y;
      expect(
        find.descendant(of: row, matching: find.text('${_all[phase]} ms')),
        findsOneWidget,
      );
    }
    expect(find.text('250 ms'), findsOneWidget);
    expect(find.text('340 ms'), findsNothing);
  });

  testWidgets('partial failed attempt omits unrecorded phases', (tester) async {
    await tester.pumpWidget(
      _app(
        const AssistantLiveStartupDiagnostics(
          timings: {
            AssistantLiveStartupPhase.token: 0,
            AssistantLiveStartupPhase.total: 10,
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('0 ms'), findsOneWidget);
    expect(find.text('10 ms'), findsOneWidget);
    expect(find.text('Audio initialization'), findsNothing);
    expect(find.text('Provider ready'), findsNothing);
  });

  testWidgets('Vietnamese localizes phase labels and overlap explanation', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        const AssistantLiveStartupDiagnostics(timings: _all),
        locale: const Locale('vi'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Lần kết nối gần nhất'), findsOneWidget);
    expect(find.text('Tổng thời gian'), findsOneWidget);
    expect(find.textContaining('chạy đồng thời'), findsOneWidget);
  });

  testWidgets('full info sheet scrolls on small screen with enlarged text', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(320, 480)
      ..devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    var closed = false;
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: AssistantLiveInfoSheetBody(
              liveUiState: const AssistantLiveUiState(
                kind: AssistantLiveUiKind.live,
                tone: AssistantLiveUiTone.positive,
                workspaceTier: 'PRO',
                activeTier: 'PRO',
                creditSource: AssistantCreditSource.personal,
                isEligible: true,
                isVisibleLiveSession: true,
              ),
              liveState: const AssistantLiveState(startupTimings: _all),
              onClose: () => closed = true,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Got it'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Got it'));
    expect(closed, isTrue);
  });
}
