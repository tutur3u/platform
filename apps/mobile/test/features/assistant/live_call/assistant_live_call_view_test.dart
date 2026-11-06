import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_timer.dart';

import '../widgets/assistant_component_raster.dart';
import 'live_call_harness.dart';

const Map<String, ui.Size> _sizes = {
  'phone': ui.Size(390, 844),
  'tablet': ui.Size(820, 1180),
};
const Map<String, (AppearanceSettings, Brightness)> _appearances = {
  'light': (AppearanceSettings(), Brightness.light),
  'dark': (AppearanceSettings(), Brightness.dark),
  'aurora-blobs': (
    AppearanceSettings(
      theme: AppearanceThemeId.aurora,
      backgroundStyle: AppearanceBackgroundStyle.blobs,
    ),
    Brightness.dark,
  ),
};

void main() {
  setUpAll(loadAssistantRenderFonts);

  testWidgets('timer ticks once per elapsed second without rebuilding peers', (
    tester,
  ) async {
    var now = DateTime.utc(2026, 10, 25, 4, 0, 0, 400);
    final start = DateTime.utc(2026, 10, 25, 3, 59, 1);
    var peerBuilds = 0;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Localizations(
          locale: const Locale('en'),
          delegates: liveCallLocalizations,
          child: Column(
            children: [
              Builder(
                builder: (_) {
                  peerBuilds++;
                  return const SizedBox();
                },
              ),
              AssistantLiveCallTimer(startedAt: start, clock: () => now),
            ],
          ),
        ),
      ),
    );
    expect(find.text('00:59'), findsOneWidget);
    now = now.add(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('01:00'), findsOneWidget);
    now = now.add(const Duration(hours: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('1:01:00'), findsOneWidget);
    expect(peerBuilds, 1);
  });

  testWidgets('connected call exposes the timer, labelled controls and End', (
    tester,
  ) async {
    setLiveCallViewport(tester, _sizes['phone']!);
    final log = LiveCallActionLog();
    final handle = tester.ensureSemantics();
    final state = liveCallStates(DateTime.now())['connected']!;
    await tester.pumpWidget(liveCallApp(state: state, actions: log.actions));
    await tester.pump();

    expect(
      find.byKey(const ValueKey('assistant-live-call-timer')),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Call duration'), findsOneWidget);
    for (final label in [
      'Mute',
      'Camera',
      'Keyboard',
      'Captions',
      'End',
      'Minimize',
    ]) {
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
    }
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));

    await tester.tap(find.byKey(const ValueKey('assistant-live-call-end')));
    await tester.tap(find.bySemanticsLabel('Mute'));
    await tester.pump();
    expect(log.calls, ['end', 'mic']);
    handle.dispose();
  });

  testWidgets('connecting keeps End available and disables in-call controls', (
    tester,
  ) async {
    setLiveCallViewport(tester, _sizes['phone']!);
    final log = LiveCallActionLog();
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      liveCallApp(
        state: const AssistantLiveState(
          status: AssistantLiveConnectionStatus.connecting,
        ),
        actions: log.actions,
      ),
    );
    await tester.pump();
    expect(find.text('Connecting…'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Mute'), warnIfMissed: false);
    await tester.tap(find.byKey(const ValueKey('assistant-live-call-end')));
    await tester.pump();
    expect(log.calls, ['end']);
    handle.dispose();
  });

  testWidgets('muted and ended states summarise the call', (tester) async {
    setLiveCallViewport(tester, _sizes['phone']!);
    final log = LiveCallActionLog();
    final states = liveCallStates(DateTime.now());
    await tester.pumpWidget(
      liveCallApp(state: states['muted']!, actions: log.actions),
    );
    await tester.pump();
    expect(find.text('Muted'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^1:00:0\d$')), findsOneWidget);

    await tester.pumpWidget(
      liveCallApp(state: states['ended']!, actions: log.actions),
    );
    await tester.pump();
    expect(find.text('Call ended · 03:12'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('assistant-live-call-again')));
    await tester.pump();
    expect(log.calls, ['again']);
  });

  testWidgets('landscape and large text with captions open scroll safely', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final connected = liveCallStates(DateTime.now())['connected']!;
    for (final size in const [ui.Size(844, 390), ui.Size(390, 844)]) {
      setLiveCallViewport(tester, size);
      final log = LiveCallActionLog();
      await tester.pumpWidget(
        liveCallApp(
          state: connected,
          actions: log.actions,
          brightness: Brightness.dark,
          captionsOpen: true,
          viewKey: ValueKey('large-text-$size'),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.takeException(), isNull, reason: '$size');
      final end = find.byKey(const ValueKey('assistant-live-call-end'));
      await tester.ensureVisible(end);
      await tester.pump();
      await tester.tap(end);
      await tester.pump();
      expect(log.calls, ['end'], reason: '$size');
      await renderLiveCall(
        tester,
        'large-text-${size.width.toInt()}x${size.height.toInt()}-connected',
      );
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('large text never splits a control label mid-word', (
    tester,
  ) async {
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    setLiveCallViewport(tester, _sizes['phone']!);
    final connected = liveCallStates(DateTime.now())['connected']!;
    for (final scale in const [2.0, 3.0]) {
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      await tester.pumpWidget(
        liveCallApp(
          state: connected,
          actions: LiveCallActionLog().actions,
          viewKey: ValueKey('label-scale-$scale'),
        ),
      );
      await tester.pump();
      for (final label in const [
        'Mute',
        'Camera',
        'Keyboard',
        'Captions',
        'End',
        'Minimize',
      ]) {
        final paragraph = tester.renderObject<RenderParagraph>(
          find.text(label),
        );
        final lineTops = paragraph
            .getBoxesForSelection(
              TextSelection(baseOffset: 0, extentOffset: label.length),
            )
            .map((box) => box.top.round())
            .toSet();
        expect(lineTops, hasLength(1), reason: '$label at ${scale}x');
        expect(paragraph.didExceedMaxLines, isFalse, reason: label);
      }
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('renders the call surface matrix', (tester) async {
    final states = liveCallStates(DateTime.now());
    for (final size in _sizes.entries) {
      setLiveCallViewport(tester, size.value);
      for (final look in _appearances.entries) {
        for (final entry in states.entries) {
          final captions = entry.key == 'connected';
          await tester.pumpWidget(
            liveCallApp(
              state: entry.value,
              actions: LiveCallActionLog().actions,
              appearance: look.value.$1,
              brightness: look.value.$2,
              captionsOpen: captions,
              viewKey: ValueKey('${size.key}-${look.key}-${entry.key}'),
            ),
          );
          await tester.pump(const Duration(milliseconds: 200));
          expect(tester.takeException(), isNull);
          await renderLiveCall(tester, '${size.key}-${look.key}-${entry.key}');
        }
      }
    }
    await tester.pumpWidget(const SizedBox());
  });
}
