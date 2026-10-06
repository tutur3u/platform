import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';

import 'background_reply_harness.dart';
import 'compact_model_header_harness.dart';

class _Repository extends ReplyRepository {
  final writes = <String>[];
  Completer<AssistantSoul>? held;
  Error? failure;
  String name = 'Atlas';
  @override
  Future<AssistantSoul> fetchSoul({bool forceRefresh = false}) async =>
      AssistantSoul(name: name);
  @override
  Future<AssistantSoul> updateSoulName(String value) async {
    writes.add(value);
    if (held != null) return await held!.future;
    if (failure != null) throw failure!;
    name = value;
    return AssistantSoul(name: name);
  }
}

final Finder input = find.byKey(const ValueKey('assistant-name-input'));
Future<void> openName(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('assistant-name-title')));
  await tester.pumpAndSettle();
}

void main() {
  for (final language in ['en', 'vi']) {
    testWidgets('actual page title opens autofocus name dialog $language', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final h = CompactModelHeaderHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, locale: Locale(language));
      final title = find.descendant(
        of: find.byType(AssistantModeTitle),
        matching: find.text('Mira'),
      );
      expect(title, findsOneWidget);
      await tester.tap(title);
      await tester.pumpAndSettle();
      final field = find.byKey(const ValueKey('assistant-name-input'));
      expect(field, findsOneWidget);
      expect(tester.widget<TextField>(field).autofocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);
    });
  }
  for (final language in ['en', 'vi']) {
    testWidgets(
      'name save trims draft and immediately updates both modes $language',
      (tester) async {
        final repo = _Repository();
        final h = CompactModelHeaderHarness(repository: repo);
        addTearDown(() => h.dispose(tester));
        await h.mount(tester, locale: Locale(language));
        await openName(tester);
        await tester.enterText(input, '  Nova  ');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(repo.writes, ['Nova']);
        expect(input, findsNothing);
        expect(
          find.descendant(
            of: find.byType(AssistantModeTitle),
            matching: find.text('Nova'),
          ),
          findsOneWidget,
        );
        h.chrome.enterLiveMode();
        await tester.pumpAndSettle();
        expect(
          find.descendant(
            of: find.byType(AssistantModeTitle),
            matching: find.text('Nova'),
          ),
          findsOneWidget,
        );
        expect(repo.starts, 0);
      },
    );
    testWidgets('safe error retains editable draft and retry $language', (
      tester,
    ) async {
      final repo = _Repository()
        ..failure = StateError('Synthetic sensitive transport detail');
      final h = CompactModelHeaderHarness(repository: repo);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, locale: Locale(language));
      await openName(tester);
      await tester.enterText(input, 'Nova');
      await tester.tap(find.byKey(const ValueKey('assistant-name-save')));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(input).controller!.text, 'Nova');
      expect(
        find.byKey(const ValueKey('assistant-name-error')),
        findsOneWidget,
      );
      expect(find.textContaining('Synthetic sensitive'), findsNothing);
      expect(
        find.descendant(
          of: find.byType(AssistantModeTitle),
          matching: find.text('Atlas'),
        ),
        findsOneWidget,
      );
      repo.failure = null;
      await tester.tap(find.byKey(const ValueKey('assistant-name-save')));
      await tester.pumpAndSettle();
      expect(repo.writes, ['Nova', 'Nova']);
      expect(input, findsNothing);
    });
  }
  testWidgets(
    'busy save cannot dispatch duplicate and blank cancel never writes',
    (tester) async {
      final repo = _Repository()..held = Completer<AssistantSoul>();
      final h = CompactModelHeaderHarness(repository: repo);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await openName(tester);
      await tester.enterText(input, 'Nova');
      await tester.tap(find.byKey(const ValueKey('assistant-name-save')));
      await tester.pump();
      expect(tester.widget<TextField>(input).enabled, isFalse);
      expect(
        tester
            .widget<TextButton>(
              find.byKey(const ValueKey('assistant-name-save')),
            )
            .onPressed,
        isNull,
      );
      repo.held!.complete(const AssistantSoul(name: 'Nova'));
      await tester.pumpAndSettle();
      expect(repo.writes, ['Nova']);
      await openName(tester);
      await tester.enterText(input, '  ');
      await tester.pump();
      expect(
        tester
            .widget<TextButton>(
              find.byKey(const ValueKey('assistant-name-save')),
            )
            .onPressed,
        isNull,
      );
      final l10n = AppLocalizations.of(tester.element(input));
      await tester.tap(find.text(l10n.commonCancel));
      await tester.pumpAndSettle();
      expect(repo.writes, ['Nova']);
    },
  );
  for (final departure in ['actor', 'workspace']) {
    for (final pending in [false, true]) {
      testWidgets(
        'name draft and retained save reject $departure ABA pending=$pending',
        (tester) async {
          final repo = _Repository();
          final h = CompactModelHeaderHarness(repository: repo);
          addTearDown(() => h.dispose(tester));
          await h.mount(tester);
          await openName(tester);
          await tester.enterText(input, 'Old');
          final retained = tester
              .widget<TextButton>(
                find.byKey(const ValueKey('assistant-name-save')),
              )
              .onPressed!;
          if (pending) {
            repo.held = Completer<AssistantSoul>();
            retained();
            await tester.pump();
          }
          if (departure == 'actor') {
            final original = h.auth.state;
            h.auth.change(const AuthState.unauthenticated());
            await tester.pump();
            h.auth.change(original);
          } else {
            h.workspace.change('synthetic-other');
            await tester.pump();
            h.workspace.change('synthetic-ws');
          }
          await tester.pumpAndSettle();
          expect(input, findsNothing);
          if (pending) {
            repo.held!.complete(const AssistantSoul(name: 'Old'));
          } else {
            retained();
          }
          await tester.pumpAndSettle();
          expect(repo.writes.length, pending ? 1 : 0);
          final shell = h.pageContext(tester).read<AssistantShellCubit>();
          expect(shell.state.soul.name, isNot('Old'));
          expect(
            find.byKey(const ValueKey('assistant-name-error')),
            findsNothing,
          );
        },
      );
    }
  }
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('actual rename native paste with keyboard open $platform', (
      tester,
    ) async {
      debugDefaultTargetPlatformOverride = platform;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      tester.view.viewInsets = const FakeViewPadding(bottom: 260);
      addTearDown(tester.view.resetViewInsets);
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.getData') return {'text': 'Nova'};
          if (call.method == 'Clipboard.hasStrings') return {'value': true};
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      final repo = _Repository();
      final h = CompactModelHeaderHarness(repository: repo);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await openName(tester);
      final field = tester.widget<TextField>(input);
      final controller = field.controller!;
      controller.selection = TextSelection(
        baseOffset: 0,
        extentOffset: controller.text.length,
      );
      final editable = tester.state<EditableTextState>(
        find.descendant(of: input, matching: find.byType(EditableText)),
      );
      expect(editable.showToolbar(), isTrue);
      await tester.pumpAndSettle();
      final paste = find.text('Paste');
      expect(paste, findsOneWidget);
      final gesture = await tester.startGesture(tester.getCenter(paste));
      await tester.pump();
      expect(field.focusNode!.hasFocus, isTrue);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(controller.text, 'Nova');
      expect(field.focusNode!.hasFocus, isTrue);
      expect(repo.writes, isEmpty);
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    });
  }
}
