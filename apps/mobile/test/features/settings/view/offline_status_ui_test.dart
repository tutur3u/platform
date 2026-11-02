import 'dart:convert';
import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  final retry = DateTime.utc(2026, 11, 3, 19, 15);
  final synced = DateTime.utc(2026, 11, 2, 4, 30);
  for (final locale in ['en', 'vi']) {
    for (final status in OfflinePreparationStatus.values) {
      testWidgets('$locale renders ${status.name} with local timestamps', (
        tester,
      ) async {
        final l10n = await AppLocalizations.delegate.load(Locale(locale));
        final workspace = _Workspace();
        whenListen(
          workspace,
          const Stream<WorkspaceState>.empty(),
          initialState: const WorkspaceState(),
        );
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
        );
        coordinator.state.value = OfflinePreparationState(
          products: {
            'finance': OfflineProductPreparation(
              status: status,
              retryAt: retry,
              lastSuccess: synced,
            ),
          },
        );
        addTearDown(workspace.close);
        // Resolve the locale inside the app's localization boundary.
        await tester.pumpThemedHome(
          Builder(
            builder: (context) => Localizations.override(
              context: context,
              locale: Locale(locale),
              child: Material(
                child: SingleChildScrollView(
                  child: OfflinePreparationSection(
                    coordinator: coordinator,
                    offlineStatusUiEnabled: true,
                  ),
                ),
              ),
            ),
          ),
          wrap: (app) =>
              BlocProvider<WorkspaceCubit>.value(value: workspace, child: app),
        );
        await tester.pump();
        final expected = switch (status) {
          OfflinePreparationStatus.ready => l10n.offlineStatusReady,
          OfflinePreparationStatus.downloading => l10n.offlineStatusPreparing,
          OfflinePreparationStatus.waitingWifi => l10n.offlineWaitingWifi,
          OfflinePreparationStatus.waitingRetry => l10n.offlineWaitingRetry(
            DateFormat.yMd(locale).add_jm().format(retry.toLocal()),
          ),
          OfflinePreparationStatus.failed => l10n.offlinePreparationFailed,
          // Waiting its turn is never shown as "not available".
          OfflinePreparationStatus.queued =>
            l10n.offlinePreparationNeedsRefresh,
          OfflinePreparationStatus.unavailable =>
            l10n.offlinePreparationUnavailable,
        };
        expect(find.text(expected), findsWidgets);
        expect(
          find.text(
            l10n.offlineStatusLastSynced(
              DateFormat.yMd(locale).add_jm().format(synced.toLocal()),
            ),
          ),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('offline-status-summary')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('offline-status-progress-finance')),
          status == OfflinePreparationStatus.downloading
              ? findsOneWidget
              : findsNothing,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        coordinator.state.dispose();
      });
    }
  }

  for (final enabled in [false, true]) {
    testWidgets('flag $enabled gates all additions', (tester) async {
      final workspace = _Workspace();
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(),
      );
      final coordinator = OfflinePreparationCoordinator.forTesting(
        load: (_, _) async => {},
        write: (_, _, _) async {},
      );
      coordinator.state.value = const OfflinePreparationState(
        products: {
          'finance': OfflineProductPreparation(
            status: OfflinePreparationStatus.downloading,
          ),
        },
      );
      addTearDown(workspace.close);
      await tester.pumpThemedHome(
        Material(
          child: SingleChildScrollView(
            child: OfflinePreparationSection(
              coordinator: coordinator,
              offlineStatusUiEnabled: enabled,
            ),
          ),
        ),
        wrap: (app) =>
            BlocProvider<WorkspaceCubit>.value(value: workspace, child: app),
      );
      await tester.pump();
      expect(
        find.byKey(const ValueKey('offline-status-summary')),
        enabled ? findsOneWidget : findsNothing,
      );
      expect(
        find.text('Never synced'),
        enabled ? findsNWidgets(4) : findsNothing,
      );
      expect(find.text(enabled ? 'Preparing' : 'Downloading'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('offline-status-progress-finance')),
        enabled ? findsOneWidget : findsNothing,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      coordinator.state.dispose();
    });
  }

  test('English and Vietnamese ARBs include every status string', () {
    for (final locale in ['en', 'vi']) {
      final arb =
          jsonDecode(File('lib/l10n/arb/app_$locale.arb').readAsStringSync())
              as Map<String, dynamic>;
      for (final key in [
        'offlineStatusReady',
        'offlineStatusPreparing',
        'offlineStatusNeverSynced',
        'offlineStatusLastSynced',
        'offlineStatusSummary',
        'offlineWaitingWifi',
        'offlineWaitingRetry',
        'offlinePreparationFailed',
        'offlinePreparationUnavailable',
      ]) {
        expect(
          arb[key],
          isA<String>().having((s) => s.isNotEmpty, key, isTrue),
        );
      }
    }
  });
}
