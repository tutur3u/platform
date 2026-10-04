import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/timezone_http_harness.dart';

void main() {
  for (final workspace in [false, true]) {
    testWidgets(
      'scope workspace=$workspace resume during 429 retains PATCH retry',
      (tester) async {
        var now = DateTime.now();
        final h = TimezoneHttpHarness(clock: () => now);
        final cubit = TimezoneSettingsCubit(
          repository: h.repository,
          deviceLoader: () async => 'UTC',
          clock: () => now,
        );
        addTearDown(() async {
          await cubit.close();
          h.dispose();
        });
        var blockSave = true;
        h.respond = (req) async {
          if (req.method == 'PATCH' && blockSave) {
            return http.Response('{}', 429, headers: {'retry-after': '30'});
          }
          return TimezoneHttpHarness.json({
            'timezone': req.method == 'PATCH' ? 'Europe/London' : 'UTC',
          });
        };
        await cubit.load(
          userId: 'synthetic-actor',
          workspaceId: 'synthetic-ws',
        );
        await tester.pumpApp(
          BlocProvider.value(
            value: cubit,
            child: TimezoneSettingsTile(
              workspace: workspace,
              canManageWorkspace: workspace,
              userId: 'synthetic-actor',
              workspaceId: 'synthetic-ws',
            ),
          ),
        );
        await cubit.save(
          'Europe/London',
          workspace: workspace,
          canManageWorkspace: workspace,
        );
        await tester.pump();
        await cubit.reload();
        await tester.pump();
        expect(cubit.state.failedSaveZone, 'Europe/London');
        expect(cubit.state.failedSaveWorkspace, workspace);
        expect(h.requests, hasLength(3));
        now = now.add(const Duration(seconds: 31));
        blockSave = false;
        await tester.pump(const Duration(seconds: 31));
        await tester.tap(
          find.byKey(
            ValueKey(
              workspace
                  ? 'timezone-retry-workspace'
                  : 'timezone-retry-personal',
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(h.requests.map((r) => r.method), [
          'GET',
          'GET',
          'PATCH',
          'PATCH',
        ]);
        final saves = h.requests.where((r) => r.method == 'PATCH').toList();
        expect(saves[1].url, saves[0].url);
        expect(jsonDecode(saves[1].body), jsonDecode(saves[0].body));
        expect(
          workspace ? cubit.state.workspace : cubit.state.personal,
          'Europe/London',
        );
        expect(cubit.state.failedSaveZone, isNull);
        blockSave = true;
        await cubit.save(
          'Europe/London',
          workspace: workspace,
          canManageWorkspace: workspace,
        );
        expect(cubit.state.failedSaveZone, 'Europe/London');
        await cubit.load(
          userId: 'synthetic-actor',
          workspaceId: 'another-workspace',
        );
        expect(cubit.state.failedSaveZone, isNull);
        expect(cubit.state.failedSaveWorkspace, isFalse);
        expect(h.requests, hasLength(5));
        await cubit.load(
          userId: 'another-actor',
          workspaceId: 'another-workspace',
        );
        expect(cubit.state.failedSaveZone, isNull);
        expect(cubit.state.failedSaveWorkspace, isFalse);
        expect(h.requests.where((r) => r.method == 'PATCH'), hasLength(3));
        await tester.pump();
      },
    );
    testWidgets(
      'scope workspace=$workspace HTTP failure/retry/editor save is explicit',
      (tester) async {
        final h = TimezoneHttpHarness();
        final cubit = TimezoneSettingsCubit(
          repository: h.repository,
          deviceLoader: () async => 'UTC',
        );
        addTearDown(() async {
          await cubit.close();
          h.dispose();
        });
        var failRead = true;
        var failSave = true;
        h.respond = (req) async =>
            (req.method == 'GET' && failRead) ||
                (req.method == 'PATCH' && failSave)
            ? TimezoneHttpHarness.json({
                'error': 'Synthetic unavailable',
              }, status: 500)
            : TimezoneHttpHarness.json({
                'timezone': req.method == 'PATCH' ? 'Europe/London' : 'UTC',
              });
        await cubit.load(
          userId: 'synthetic-actor',
          workspaceId: 'synthetic-ws',
        );
        await tester.pumpApp(
          BlocProvider.value(
            value: cubit,
            child: TimezoneSettingsTile(
              workspace: workspace,
              canManageWorkspace: workspace,
              userId: 'synthetic-actor',
              workspaceId: 'synthetic-ws',
            ),
          ),
        );
        expect(find.text('Unknown'), findsOneWidget);
        failRead = false;
        await tester.tap(
          find.text(workspace ? 'Workspace timezone' : 'Personal timezone'),
        );
        await tester.pumpAndSettle();
        expect(find.text('Unknown'), findsNothing);
        expect(workspace ? cubit.state.workspace : cubit.state.personal, 'UTC');
        for (final shouldFail in [true, false]) {
          failSave = shouldFail;
          if (!shouldFail) {
            await tester.tap(
              find.byKey(
                ValueKey(
                  workspace
                      ? 'timezone-retry-workspace'
                      : 'timezone-retry-personal',
                ),
              ),
            );
            await tester.pumpAndSettle();
            expect(
              workspace ? cubit.state.workspace : cubit.state.personal,
              'Europe/London',
            );
            expect(h.requests.where((r) => r.method == 'GET'), hasLength(4));
            continue;
          }
          await tester.tap(
            find.text(workspace ? 'Workspace timezone' : 'Personal timezone'),
          );
          await tester.pumpAndSettle();
          await tester.enterText(find.byType(EditableText), 'london');
          await tester.pumpAndSettle();
          await tester.tap(find.text('Europe/London'));
          await tester.pumpAndSettle();
          expect(
            workspace ? cubit.state.workspace : cubit.state.personal,
            shouldFail ? 'UTC' : 'Europe/London',
          );
          expect(cubit.state.failed, shouldFail);
        }
        expect(h.requests.where((r) => r.method == 'PATCH'), hasLength(2));
      },
    );
  }
}
