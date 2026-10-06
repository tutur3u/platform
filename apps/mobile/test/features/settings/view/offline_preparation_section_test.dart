import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  testWidgets(
    'scoped download progress and failure retry fit compact large text',
    (tester) async {
      final output = Platform.environment['OFFLINE_RENDER_DIR'];
      if (output != null) {
        await tester.runAsync(() async {
          final materialFont = Platform.environment['PROFILE_MATERIAL_FONT'];
          if (materialFont != null) {
            final loader = FontLoader('Roboto')
              ..addFont(
                File(materialFont).readAsBytes().then(ByteData.sublistView),
              );
            await loader.load();
          }
          final manifest =
              jsonDecode(await rootBundle.loadString('FontManifest.json'))
                  as List<dynamic>;
          for (final entry in manifest.cast<Map<String, dynamic>>()) {
            final font = FontLoader(entry['family'] as String);
            for (final asset
                in (entry['fonts'] as List<dynamic>)
                    .cast<Map<String, dynamic>>()) {
              font.addFont(rootBundle.load(asset['asset'] as String));
            }
            await font.load();
          }
        });
      }
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = _Auth();
      final workspace = _Workspace();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.authenticated(
          supa.User(
            id: 'owner',
            appMetadata: {},
            userMetadata: {},
            aud: 'authenticated',
            createdAt: '',
          ),
        ),
      );
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          currentWorkspace: Workspace(id: 'team', name: 'Team'),
        ),
      );
      addTearDown(auth.close);
      addTearDown(workspace.close);
      final restoration = Completer<Map<String, DateTime>>();
      final coordinator = OfflinePreparationCoordinator.forTesting(
        load: (_, _) => restoration.future,
        write: (_, _, _) async {},
      );
      final pending = Completer<void>();
      var fail = true;
      var financeCalls = 0;
      coordinator.register('finance', (_) async {
        financeCalls++;
        if (fail) {
          await pending.future;
          throw Exception('Offline');
        }
      });
      for (final id in ['inventory', 'tasks', 'calendar']) {
        coordinator.register(id, (_) async {});
      }
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 700),
              textScaler: TextScaler.linear(2),
            ),
            child: RepaintBoundary(
              key: const ValueKey('offline-preparation-render'),
              child: ColoredBox(
                color: Colors.white,
                child: SingleChildScrollView(
                  child: OfflinePreparationSection(
                    coordinator: coordinator,
                    connectivity: () async => [ConnectivityResult.wifi],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      Future<void> capture(String name) async {
        if (output == null) return;
        await tester.runAsync(() async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byKey(const ValueKey('offline-preparation-render')),
          );
          final image = await boundary.toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await Directory(output).create(recursive: true);
          await File(
            '$output/$name.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }

      await tester.pump();
      expect(
        tester
            .widget<FilledButton>(
              find.byWidgetPredicate((widget) => widget is FilledButton),
            )
            .onPressed,
        isNull,
      );
      expect(financeCalls, 0);
      restoration.complete({});
      await tester.pumpAndSettle();
      expect(find.text('Download all'), findsOneWidget);
      expect(
        find.byType(Divider),
        findsNWidgets(OfflinePreparationCoordinator.productIds.length - 1),
      );
      await tester.ensureVisible(find.text('Download all'));
      await tester.tap(find.text('Download all'));
      await tester.pump();
      expect(find.text('Downloading'), findsOneWidget);
      expect(find.text('Queued'), findsNWidgets(3));
      expect(tester.takeException(), isNull);
      pending.complete();
      await tester.pumpAndSettle();
      expect(find.text('Download failed'), findsOneWidget);
      expect(find.text('Downloaded'), findsNWidgets(3));
      await capture('offline-preparation-retry');
      fail = false;
      final retry = find.byTooltip('Retry').first;
      await tester.ensureVisible(retry);
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(financeCalls, 2);
      expect(find.text('Downloaded'), findsNWidgets(4));
      await capture('offline-preparation-ready');
      expect(tester.takeException(), isNull);
    },
  );
}
