import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_host.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/features/notes/voice/notes_voice_review.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class _Voice extends Mock implements NotesVoiceCubit {}

class _Capture extends Mock implements AssistantVoiceCaptureCubit {}

class _Workspace extends Mock implements WorkspaceCubit {}

void main() {
  for (final status in ['completed', 'review_required']) {
    testWidgets('host $status empty result review admission is truthful', (
      tester,
    ) async {
      final voice = _Voice();
      final capture = _Capture();
      final workspace = _Workspace();
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      when(() => voice.capture).thenReturn(capture);
      when(() => voice.state).thenReturn(
        NotesVoiceState(
          job: NotesVoiceJob(
            id: 'silent-job',
            workspaceId: 'ws',
            status: status,
            revision: 4,
            transcript: '',
            artifact: const {},
          ),
        ),
      );
      when(() => voice.stream).thenAnswer((_) => const Stream.empty());
      when(() => voice.setScope(any(), any())).thenAnswer((_) async {});
      when(() => capture.state).thenReturn(const AssistantVoiceCaptureState());
      when(() => capture.stream).thenAnswer((_) => const Stream.empty());
      when(() => workspace.state).thenReturn(const WorkspaceState());
      when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
      var saved = 0;
      final router = GoRouter(
        initialLocation: Routes.notes,
        routes: [
          GoRoute(
            path: Routes.notes,
            builder: (context, state) => MultiBlocProvider(
              providers: [
                BlocProvider<WorkspaceCubit>.value(value: workspace),
                BlocProvider<ShellChromeActionsCubit>.value(value: chrome),
              ],
              child: Scaffold(
                body: NotesVoiceHost(
                  enabled: true,
                  cubit: voice,
                  onSaved: () async => saved++,
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        shad.ShadcnApp.router(
          theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
          builder: ShadcnMaterialBridge.appBuilder,
        ),
      );
      await tester.pumpAndSettle();
      final reviews = chrome.state
          .resolveForLocation(Routes.notes)
          .where((action) => action.id == 'notes-voice-review');
      if (status == 'review_required') {
        expect(reviews, isEmpty);
        expect(find.byType(NotesVoiceReview), findsNothing);
      } else {
        expect(reviews, hasLength(1));
        reviews.single.onPressed!();
        await tester.pumpAndSettle();
        expect(find.byType(NotesVoiceReview), findsOneWidget);
        expect(
          find.text('No speech was detected. Record again when ready.'),
          findsOneWidget,
        );
        final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Save note to this workspace'),
        );
        expect(button.onPressed, isNull);
        await tester.tap(find.text('Save note to this workspace'));
        await tester.pumpAndSettle();
        expect(saved, 0);
        verifyNever(() => voice.saveReviewed(any()));
        verifyNever(voice.analyze);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
