import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/widgets/assistant_local_status_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'compact_model_header_harness.dart';

void main() {
  for (final departure in ['actor', 'workspace']) {
    testWidgets('null-actor compose lease rejects retained $departure ABA', (
      tester,
    ) async {
      final h = CompactModelHeaderHarness();
      final authenticated = h.auth.state;
      h.auth.change(const AuthState.unauthenticated());
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, actualNavbar: true);
      final retained = h.actions.state
          .resolveForLocation('/assistant')
          .singleWhere((action) => action.id == 'assistant-compose')
          .onPressed!;
      if (departure == 'actor') {
        h.auth.change(authenticated);
        await tester.pumpAndSettle();
        h.auth.change(const AuthState.unauthenticated());
      } else {
        h.workspace.change('synthetic-other');
        await tester.pumpAndSettle();
        h.workspace.change('synthetic-ws');
      }
      await tester.pumpAndSettle();
      retained();
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      final current = h.actions.state
          .resolveForLocation('/assistant')
          .singleWhere((action) => action.id == 'assistant-compose')
          .onPressed!;
      current();
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
      expect(h.chrome.state.composerVisible, isTrue);
      expect(h.repository.starts, 0);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'cached actions stay stable and reject mode and actor departure',
    (tester) async {
      final h = CompactModelHeaderHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, actualNavbar: true);
      final before = h.actions.state.resolveForLocation('/assistant');
      h.chrome.toggleComposerNavigation();
      await tester.pumpAndSettle();
      final stable = h.actions.state.resolveForLocation('/assistant');
      for (var i = 0; i < before.length; i++) {
        expect(stable[i].onPressed, same(before[i].onPressed));
      }
      final more = before.singleWhere(
        (action) => action.id == 'assistant-more',
      );
      final live = before.singleWhere(
        (action) => action.id == 'assistant-mode-live',
      );
      h.chrome.enterLiveMode();
      await tester.pumpAndSettle();
      more.onPressed!();
      await tester.pumpAndSettle();
      expect(
        find.text(
          AppLocalizations.of(h.pageContext(tester)).assistantSettingsTitle,
        ),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('assistant-name-title')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('assistant-local-header-status')),
        findsNothing,
      );
      h.chrome.exitLiveMode();
      await tester.pumpAndSettle();
      final actor = h.auth.state;
      h.auth.change(const AuthState.unauthenticated());
      await tester.pumpAndSettle();
      h.auth.change(actor);
      await tester.pumpAndSettle();
      more.onPressed!();
      live.onPressed!();
      await tester.pumpAndSettle();
      expect(h.chrome.state.isLiveMode, isFalse);
      expect(
        find.text(
          AppLocalizations.of(h.pageContext(tester)).assistantSettingsTitle,
        ),
        findsNothing,
      );
      expect(h.repository.starts, 0);
      expect(tester.takeException(), isNull);
    },
  );
  for (final language in ['en', 'vi']) {
    for (final scale in [1.0, 2.0, 3.0]) {
      testWidgets('production page navbar 320 $language scale$scale '
          'has two distinct targets', (tester) async {
        tester.view.physicalSize = const Size(320, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final h = CompactModelHeaderHarness();
        addTearDown(() => h.dispose(tester));
        await h.mount(
          tester,
          locale: Locale(language),
          actualNavbar: true,
          textScale: scale,
        );
        final page = h.pageContext(tester);
        final local = page.read<AssistantLocalChatCubit>();
        await tester.runAsync(
          () => local.select(assistantLocalModels.first.id),
        );
        await tester.pumpAndSettle();
        final rename = find.byKey(const ValueKey('assistant-name-title'));
        final recovery = find.byKey(
          const ValueKey('assistant-local-header-status'),
        );
        expect(rename, findsOneWidget);
        expect(recovery, findsOneWidget);
        final bar = tester.getRect(find.byType(shad.AppBar).first);
        for (final action in [rename, recovery]) {
          final rect = tester.getRect(action);
          expect(rect.width, greaterThanOrEqualTo(48));
          expect(rect.height, greaterThanOrEqualTo(48));
          expect(bar.contains(rect.topLeft), isTrue);
          expect(bar.contains(rect.bottomRight), isTrue);
        }
        expect(
          tester.getRect(rename).overlaps(tester.getRect(recovery)),
          isFalse,
        );
        expect(
          find.descendant(
            of: find.byType(AssistantModeTitle),
            matching: find.text('Mira'),
          ),
          findsOneWidget,
        );
        await tester.tap(rename);
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('assistant-name-input')),
          findsOneWidget,
        );
        await tester.tap(find.text(AppLocalizations.of(page).commonCancel));
        await tester.pumpAndSettle();
        await tester.tap(recovery);
        await tester.pumpAndSettle();
        expect(find.byType(AssistantLocalStatusSheet), findsOneWidget);
        Navigator.of(
          tester.element(find.byType(AssistantLocalStatusSheet)),
        ).pop();
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('shell-action-button-assistant-more')),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(AppLocalizations.of(page).assistantHistoryTitle),
          findsOneWidget,
        );
        expect(
          find.text(AppLocalizations.of(page).assistantSettingsTitle),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        expect(h.repository.starts, 0);
      });
    }
  }
}
