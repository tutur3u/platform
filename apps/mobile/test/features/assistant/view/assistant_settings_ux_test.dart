import 'dart:async';
import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_editor.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_browsing_setting.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/product_settings_registry.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart' as personal;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  testWidgets(
    'Assistant tile waits for auth readiness and retains eligible scope',
    (tester) async {
      final auth = _Auth();
      final workspace = _Workspace();
      final states = StreamController<AuthState>();
      const user = User(
        id: 'synthetic-user',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2030-01-01',
      );
      whenListen(
        auth,
        states.stream,
        initialState: const AuthState.mfaRequired(user),
      );
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'synthetic-ws'),
        ),
      );
      addTearDown(() async {
        await states.close();
        await auth.close();
        await workspace.close();
      });
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: const ProductSettingsSection(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('assistant')), findsNothing);
      states.add(const AuthState.authenticated(user));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('assistant')), findsOneWidget);
      states.add(const AuthState.authenticated(user).copyWith(isLoading: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('assistant')), findsNothing);
      states.add(const AuthState.authenticated(user));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('assistant')), findsOneWidget);
    },
  );
  testWidgets('long live explanation opens an accessible dialog', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpApp(
      Material(
        child: AssistantLiveBrowsingSetting(
          keepLiveWhileBrowsing: false,
          onKeepLiveWhileBrowsingChanged: ({required value}) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    final l = tester.element(find.byType(AssistantLiveBrowsingSetting)).l10n;
    expect(find.text(l.assistantKeepLiveBrowsingDescription), findsNothing);
    await tester.tap(
      find.byTooltip(l.assistantSettingInfo(l.assistantKeepLiveBrowsingTitle)),
    );
    await tester.pumpAndSettle();
    expect(find.text(l.assistantKeepLiveBrowsingDescription), findsOneWidget);
    expect(find.byType(AppDialog), findsOneWidget);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
  testWidgets(
    'personality preview stays compact with full accessible content',
    (tester) async {
      final text = List.filled(30, 'Synthetic full personality').join(' ');
      final repository = personal.SettingsRepository()
        ..read = () async => AssistantPersonalSettingsSnapshot(
          soul: AssistantSoul(personality: text),
          memoryEnabled: false,
          memories: const [],
        );
      final cubit = AssistantPersonalSettingsCubit(
        workspaceId: 'synthetic-ws',
        repository: repository,
        isScopeCurrent: () => true,
        currentUserId: () => 'actor-a',
      );
      addTearDown(cubit.close);
      await cubit.load();
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();

      await tester.pumpApp(
        Material(
          child: AssistantPersonalityEditor(
            cubit: cubit,
            isScopeCurrent: () => true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final tile = find.byKey(
        const ValueKey('assistant-personality-personality'),
      );
      final preview = find.descendant(of: tile, matching: find.text(text));
      expect(tester.getRect(preview).height, lessThanOrEqualTo(50));
      expect(
        find.bySemanticsLabel(RegExp(RegExp.escape(text))),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      semantics.dispose();
    },
    timeout: const Timeout(Duration(seconds: 30)),
  );
  testWidgets('audio draft opens preview and retains removable failed upload', (
    tester,
  ) async {
    final directory = (await tester.runAsync(
      () => Directory.systemTemp.createTemp('assistant-preview-synthetic-'),
    ))!;
    final file = File('${directory.path}/synthetic.m4a');
    await tester.runAsync(() => file.writeAsBytes([0]));
    addTearDown(() => directory.delete(recursive: true));
    var removed = false;
    await tester.pumpApp(
      Material(
        child: AssistantAttachmentPreview(
          attachment: AssistantAttachment(
            id: 'synthetic-audio',
            name: 'Synthetic audio',
            size: 1,
            type: 'audio/mp4',
            localPath: file.path,
            uploadState: AssistantAttachmentUploadState.error,
          ),
          onRemove: () => removed = true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AppChip));
    await tester.pumpAndSettle();
    expect(find.byType(AppSheetScaffold), findsOneWidget);
    // No video/audio platform is installed in this widget harness.
    final l = tester.element(find.byType(AppSheetScaffold)).l10n;
    expect(find.text(l.assistantMediaPreviewError), findsOneWidget);
    expect(removed, isFalse);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Delete: Synthetic audio'));
    await tester.pump();
    expect(removed, isTrue);
    expect(tester.takeException(), isNull);
  });
}
