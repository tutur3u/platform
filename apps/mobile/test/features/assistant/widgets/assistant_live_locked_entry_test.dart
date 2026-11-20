import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/design_render_harness.dart';

const _plan = AssistantLiveEligibility(
  eligible: false,
  reason: AssistantLiveBlockReason.planRequired,
  billingPersonal: true,
);

Widget _view({
  required Future<void> Function() onStart,
  AssistantLiveEligibility? blocked,
  Future<void> Function()? onShowBlocked,
}) => AssistantLiveModeView(
  chatState: const AssistantChatState(fallbackChatId: 'chat'),
  liveState: const AssistantLiveState(),
  liveUiState: AssistantLiveUiState(
    kind: blocked == null
        ? AssistantLiveUiKind.available
        : AssistantLiveUiKind.unavailable,
    tone: AssistantLiveUiTone.neutral,
    workspaceTier: 'PRO',
    activeTier: 'PRO',
    creditSource: AssistantCreditSource.personal,
    isEligible: blocked == null,
    isVisibleLiveSession: false,
  ),
  assistantName: 'Mira',
  scrollController: ScrollController(),
  onRetry: () async {},
  onToggleMicrophone: onStart,
  onToggleCamera: () async {},
  onDisconnect: () async {},
  onOpenTextEntry: () async {},
  blocked: blocked,
  onShowBlocked: onShowBlocked,
);

Widget _app(Widget child) => MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MediaQuery(
    data: const MediaQueryData(size: Size(390, 844), disableAnimations: true),
    child: Scaffold(body: child),
  ),
);

void main() {
  final l10n = AppLocalizationsEn();

  testWidgets('an ineligible account sees a lock, not a Start button', (
    tester,
  ) async {
    var starts = 0;
    var explained = 0;
    await tester.pumpWidget(
      _app(
        _view(
          blocked: _plan,
          onStart: () async => starts++,
          onShowBlocked: () async => explained++,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('live-stage-start')), findsNothing);
    expect(find.byKey(const ValueKey('live-stage-orb-start')), findsNothing);
    expect(find.byKey(const ValueKey('live-stage-locked')), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        l10n.assistantLiveBlockedLockedLabel(
          l10n.assistantLiveBlockedPlanShort,
        ),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('live-stage-see-why')));
    expect(explained, 1);
    expect(starts, 0);
  });

  testWidgets('an eligible account keeps the Start button', (tester) async {
    var starts = 0;
    await tester.pumpWidget(_app(_view(onStart: () async => starts++)));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('live-stage-locked')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('live-stage-start')));
    expect(starts, 1);
  });

  for (final theme in ['light', 'dark']) {
    testWidgets('locked entry renders in $theme', (tester) async {
      await DesignRender.loadFonts();
      DesignRender.setSize(tester, const Size(390, 640));
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: _view(
            blocked: _plan,
            onStart: () async {},
            onShowBlocked: () async {},
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'mira-live-blocked/$theme-locked');
    });
  }
}
