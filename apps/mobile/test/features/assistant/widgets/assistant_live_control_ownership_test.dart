import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/l10n/l10n.dart';

import 'assistant_live_shell_harness.dart';

void main() {
  for (final control in liveControlIds) {
    for (final invalidation in [
      AssistantLiveConnectionStatus.disconnected,
      AssistantLiveConnectionStatus.error,
    ]) {
      testWidgets(
        '$control retires on $invalidation and keeps replacement owned',
        (tester) async {
          final old = Completer<void>();
          final replacement = Completer<void>();
          var status = AssistantLiveConnectionStatus.connected;
          var calls = 0;
          late StateSetter update;
          Future<void> invoke() {
            calls++;
            return switch (calls) {
              1 => old.future,
              2 => replacement.future,
              _ => Future<void>.value(),
            };
          }

          await tester.pumpWidget(
            MaterialApp(
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: Scaffold(
                body: StatefulBuilder(
                  builder: (context, setState) {
                    update = setState;
                    return AssistantLiveCallControls(
                      state: AssistantLiveState(status: status),
                      onMicrophone: invoke,
                      onCamera: invoke,
                      onText: invoke,
                      onDisconnect: invoke,
                    );
                  },
                ),
              ),
            ),
          );
          final target = find.byKey(ValueKey('live-control-$control'));
          final identity = tester.element(target);
          final button = find.descendant(
            of: target,
            matching: find.byType(AppIconButton),
          );
          await tester.tap(target);
          await tester.pump();
          await tester.tap(target);
          expect(calls, 1);
          expect(tester.widget<AppIconButton>(button).onPressed, isNull);

          for (final next in [
            AssistantLiveConnectionStatus.preparing,
            AssistantLiveConnectionStatus.connecting,
            AssistantLiveConnectionStatus.connected,
          ]) {
            update(() => status = next);
            await tester.pump();
          }
          expect(tester.widget<AppIconButton>(button).onPressed, isNull);
          await tester.tap(target);
          expect(calls, 1);

          update(() => status = invalidation);
          await tester.pump();
          update(() => status = AssistantLiveConnectionStatus.connected);
          await tester.pump();
          expect(tester.element(target), same(identity));
          expect(old.isCompleted, isFalse);
          expect(tester.widget<AppIconButton>(button).onPressed, isNotNull);
          await tester.tap(target);
          await tester.pump();
          expect(calls, 2);

          old.complete();
          await tester.pump();
          expect(replacement.isCompleted, isFalse);
          expect(tester.widget<AppIconButton>(button).onPressed, isNull);
          await tester.tap(target);
          expect(calls, 2);

          replacement.complete();
          await tester.pump();
          expect(tester.widget<AppIconButton>(button).onPressed, isNotNull);
          await tester.tap(target);
          await tester.pump();
          expect(calls, 3);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
