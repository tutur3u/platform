import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mobile/features/notes/ai/notes_local_ai_cubit.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/notes_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import 'notes_local_ai_cubit_test.dart' show AiModel, AiSession;

class _Workspace extends Mock implements WorkspaceCubit {}

class _Notes extends NoteRepository {
  final record = const NoteRecord(
    id: 'note',
    title: 'My note',
    updatedAt: null,
    archived: false,
    content: {
      'type': 'doc',
      'content': [
        {
          'type': 'paragraph',
          'content': [
            {
              'type': 'text',
              'text': 'Original note',
              'marks': [
                {'type': 'bold'},
              ],
            },
          ],
        },
      ],
    },
  );
  final writes = <Map<String, dynamic>>[];
  bool fail = false;
  Completer<NoteRecord>? held;
  @override
  Future<List<NoteRecord>> cached(String wsId, {bool archived = false}) async =>
      [record];
  @override
  Future<List<NoteRecord>> refresh(
    String wsId, {
    bool archived = false,
  }) async => [record];
  @override
  Future<NoteRecord> update(
    String wsId,
    NoteRecord note, {
    String? title,
    Map<String, dynamic>? content,
    bool? archived,
  }) async {
    writes.add(content!);
    if (held != null) return await held!.future;
    if (fail) throw StateError('Uncertain save');
    return NoteRecord(
      id: note.id,
      title: title ?? note.title,
      content: content,
      updatedAt: null,
      archived: false,
    );
  }
}

Future<({GoRouter router, AiSession session})> _mount(
  WidgetTester tester,
  _Notes repository, {
  String? Function()? actor,
  Stream<Object?>? authEvents,
  Set<String> installed = const {'qwen3-600m'},
}) async {
  final workspace = _Workspace();
  when(() => workspace.state).thenReturn(
    WorkspaceState(
      currentWorkspace: Workspace.fromJson(const {
        'id': 'workspace',
        'name': 'Workspace',
      }),
    ),
  );
  when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
  final session = AiSession();
  final router = GoRouter(
    initialLocation: '${Routes.notes}?noteId=note',
    routes: [
      GoRoute(
        path: Routes.notes,
        builder: (_, _) => BlocProvider<WorkspaceCubit>.value(
          value: workspace,
          child: NotesPage(
            repository: repository,
            localAiActor: actor ?? () => 'actor',
            localAiAuthEvents: authEvents,
            localAiFactory: (scope) => NotesLocalAiCubit(
              currentScope: scope,
              supported: () async => true,
              verifiedPath: (model) async =>
                  installed.contains(model.id) ? '/verified' : null,
              runtime: AssistantLocalRuntime(
                load: (_) async => AiModel(session),
                currentScope: scope,
              ),
            ),
          ),
        ),
      ),
      GoRoute(path: '/elsewhere', builder: (_, _) => const SizedBox()),
    ],
  );
  await tester.pumpWidget(
    shad.ShadcnApp.router(
      theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        AppShadcnLocalizationsDelegate(),
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: ShadcnMaterialBridge.appBuilder,
    ),
  );
  await tester.pumpAndSettle();
  return (router: router, session: session);
}

Future<void> _generate(WidgetTester tester, AiSession session) async {
  await tester.tap(find.text('Summarize on device'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Generate locally'));
  await tester.pump();
  await tester.pump();
  expect(session.started.isCompleted, isTrue);
  session.tokens.add('A short summary');
  await session.tokens.close();
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'only verified installed models are selectable before native load',
    (tester) async {
      final fixture = await _mount(tester, _Notes());
      addTearDown(fixture.router.dispose);
      await tester.tap(find.text('Summarize on device'));
      await tester.pumpAndSettle();
      final picker = tester.widget<DropdownButton<String>>(
        find.byType(DropdownButton<String>),
      );
      // Missing Gemma and mismatched/unavailable SmolLM never enter the picker.
      expect(picker.items!.map((item) => item.value), ['qwen3-600m']);
      expect(fixture.session.started.isCompleted, isFalse);
      expect(fixture.session.prompts, isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('no verified model shows guidance and disables Generate', (
    tester,
  ) async {
    final fixture = await _mount(tester, _Notes(), installed: const {});
    addTearDown(fixture.router.dispose);
    await tester.tap(find.text('Summarize on device'));
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(
      find.text('Install or import this model in Mira settings first.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Generate locally'),
          )
          .onPressed,
      isNull,
    );
    expect(fixture.session.started.isCompleted, isFalse);
    await tester.pumpWidget(const SizedBox());
  });

  for (final change in ['actor ABA', 'edit']) {
    testWidgets(
      'held update after $change suppresses stale reconciliation and success',
      (tester) async {
        final auth = StreamController<Object?>.broadcast();
        addTearDown(auth.close);
        final repo = _Notes()..held = Completer<NoteRecord>();
        final fixture = await _mount(tester, repo, authEvents: auth.stream);
        addTearDown(fixture.router.dispose);
        final editor = tester
            .widget<QuillEditor>(find.byType(QuillEditor))
            .controller;
        await _generate(tester, fixture.session);
        await tester.tap(find.text('Append summary'));
        await tester.pump();
        expect(repo.writes, hasLength(1));
        if (change == 'actor ABA') {
          auth
            ..add('signedOut')
            ..add('signedInSameActor');
        } else {
          editor.replaceText(0, 0, 'Newer local edit ', null);
        }
        await tester.pump();
        repo.held!.complete(
          NoteRecord(
            id: 'note',
            title: 'Stale remote title',
            content: repo.record.content,
            updatedAt: null,
            archived: true,
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.text(
            'Could not confirm adding the summary. '
            'Check your note before saving again.',
          ),
          findsOneWidget,
        );
        // A stale archived response would disable the action.
        final action = tester.widget<TextButton>(
          find.widgetWithText(TextButton, 'Summarize on device'),
        );
        expect(action.onPressed, isNotNull);
        if (change == 'edit') {
          expect(editor.document.toPlainText(), startsWith('Newer local edit'));
        }
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'editing during generation dismisses review and drops late output',
    (tester) async {
      final repo = _Notes();
      final fixture = await _mount(tester, repo);
      addTearDown(fixture.router.dispose);
      final controller = tester
          .widget<QuillEditor>(find.byType(QuillEditor))
          .controller;
      await tester.tap(find.text('Summarize on device'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Generate locally'));
      await tester.pump();
      await tester.pump();
      controller.replaceText(0, 0, 'New edit ', null);
      await tester.pumpAndSettle();
      expect(find.text('Append summary'), findsNothing);
      expect(
        controller.document.toPlainText(),
        isNot(contains('A short summary')),
      );
      expect(fixture.session.closed, isTrue);
      // The user's own edit may autosave; it must contain no generated text.
      expect(repo.writes.toString(), isNot(contains('A short summary')));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'actual Notes adapter previews then appends once preserving rich text',
    (tester) async {
      final repo = _Notes();
      final fixture = await _mount(tester, repo);
      addTearDown(fixture.router.dispose);
      final controller = tester
          .widget<QuillEditor>(find.byType(QuillEditor))
          .controller;
      final original = controller.document.toDelta().toJson();
      await _generate(tester, fixture.session);
      expect(controller.document.toDelta().toJson(), original);
      expect(repo.writes, isEmpty);
      await tester.tap(find.text('Append summary'));
      await tester.pumpAndSettle();
      expect(controller.document.toPlainText(), contains('Original note'));
      expect(controller.document.toPlainText(), contains('A short summary'));
      expect(controller.document.toDelta().toJson().first, original.first);
      expect(repo.writes, hasLength(1));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('discard and route loss never write generated text', (
    tester,
  ) async {
    final repo = _Notes();
    final fixture = await _mount(tester, repo);
    addTearDown(fixture.router.dispose);
    await _generate(tester, fixture.session);
    await tester.tap(find.text('Discard preview'));
    await tester.pumpAndSettle();
    expect(repo.writes, isEmpty);
    fixture.router.go('/elsewhere');
    await tester.pumpAndSettle();
    expect(repo.writes, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'uncertain explicit save disables repeated Append and preserves dirty text',
    (tester) async {
      final repo = _Notes()..fail = true;
      final fixture = await _mount(tester, repo);
      addTearDown(fixture.router.dispose);
      await _generate(tester, fixture.session);
      await tester.tap(find.text('Append summary'));
      await tester.pumpAndSettle();
      expect(repo.writes, hasLength(1));
      expect(
        find.text(
          'Could not confirm adding the summary. '
          'Check your note before saving again.',
        ),
        findsOneWidget,
      );
      final button = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Append summary'),
      );
      expect(button.onPressed, isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('actor revocation before Append produces zero note writes', (
    tester,
  ) async {
    var actor = 'actor';
    final repo = _Notes();
    final fixture = await _mount(
      tester,
      repo,
      actor: () => actor.isEmpty ? null : actor,
    );
    addTearDown(fixture.router.dispose);
    await _generate(tester, fixture.session);
    actor = '';
    await tester.tap(find.text('Append summary'));
    await tester.pumpAndSettle();
    expect(repo.writes, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
}
