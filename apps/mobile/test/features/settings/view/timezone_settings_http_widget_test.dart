import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/timezone_http_harness.dart';

void main() {
  for (final workspace in [false, true]) {
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
