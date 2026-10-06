import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/widgets/assistant_header_status_chip.dart';
import 'package:mobile/features/assistant/widgets/assistant_local_status_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import 'compact_model_header_harness.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets(
      'actual local page publishes compact recoverable $locale header',
      (tester) async {
        final h = CompactModelHeaderHarness();
        addTearDown(() => h.dispose(tester));
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await h.mount(tester, locale: Locale(locale));
        final local = h.pageContext(tester).read<AssistantLocalChatCubit>();
        await tester.runAsync(
          () => local.select(assistantLocalModels.first.id),
        );
        await tester.pumpAndSettle();
        final chip = find.byType(AssistantHeaderStatusChip);
        expect(chip, findsOneWidget);
        expect(
          find.descendant(of: find.byType(AssistantModeTitle), matching: chip),
          findsOneWidget,
        );
        expect(
          tester
              .getSize(
                find.byKey(const ValueKey('assistant-local-header-status')),
              )
              .height,
          greaterThanOrEqualTo(48),
        );
        expect(local.state.failure, isNotNull);
        final status = h.titles.state.registrationForLocation('/assistant')!;
        expect(find.text(status.subtitle!), findsOneWidget);
        expect(find.textContaining('On device:'), findsNothing);
        expect(find.textContaining('Trên thiết bị:'), findsNothing);
        h.chrome.enterLiveMode();
        await tester.pumpAndSettle();
        expect(chip, findsNothing);
        h.chrome.exitLiveMode();
        await tester.pumpAndSettle();
        expect(chip, findsOneWidget);
        expect(h.repository.starts, 0);
        await tester.tap(
          find.byKey(const ValueKey('assistant-local-header-status')),
        );
        await tester.pumpAndSettle();
        expect(find.byType(AssistantLocalStatusSheet), findsOneWidget);
        expect(
          tester
              .widget<AssistantLocalStatusSheet>(
                find.byType(AssistantLocalStatusSheet),
              )
              .notice,
          isNotNull,
        );
        expect(
          tester
              .widget<AssistantLocalStatusSheet>(
                find.byType(AssistantLocalStatusSheet),
              )
              .preparing,
          isFalse,
        );
        Navigator.of(
          tester.element(find.byType(AssistantLocalStatusSheet)),
        ).pop();
        await tester.pumpAndSettle();
        await tester.runAsync(() => local.select(null));
        await tester.pumpAndSettle();
        expect(chip, findsNothing);
        expect(find.byType(AssistantModeTitle), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final departure in [
    'actor ABA',
    'workspace ABA',
    'selection ABA',
    'dispose',
  ]) {
    testWidgets('retained header recovery rejects $departure', (tester) async {
      final h = CompactModelHeaderHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      final local = h.pageContext(tester).read<AssistantLocalChatCubit>();
      await tester.runAsync(() => local.select(assistantLocalModels.first.id));
      await tester.pumpAndSettle();
      final retained = h.titles.state
          .registrationForLocation('/assistant')!
          .onSubtitlePressed!;
      if (departure == 'actor ABA') {
        final original = h.auth.state;
        h.auth.change(const AuthState.unauthenticated());
        await tester.pump();
        h.auth.change(original);
        await tester.pumpAndSettle();
      } else if (departure == 'workspace ABA') {
        h.workspace.change('synthetic-other-ws');
        await tester.pumpAndSettle();
        h.workspace.change('synthetic-ws');
        await tester.pumpAndSettle();
      } else if (departure == 'selection ABA') {
        await tester.runAsync(() async {
          await local.select(null);
          await local.select(assistantLocalModels.first.id);
        });
        await tester.pumpAndSettle();
      } else {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        expect(h.titles.state.registrationForLocation('/assistant'), isNull);
      }
      retained();
      await tester.pumpAndSettle();
      expect(find.byType(AssistantLocalStatusSheet), findsNothing);
      expect(h.repository.starts, 0);
      expect(tester.takeException(), isNull);
    });
  }
}
