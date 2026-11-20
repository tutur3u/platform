import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_deletion_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/view/workspace_danger_zone_section.dart';
import 'package:mobile/features/settings/view/workspace_deletion_sheet.dart';
import 'package:mocktail/mocktail.dart';

import 'workspace_admin_fixtures.dart';

class _Api extends Mock implements ApiClient {}

class _Repository extends Mock implements WorkspaceDeletionRepository {}

const _workspace = Workspace(id: 'ws-1', name: 'Acme Studio');

ApiException _http(int status, [String? code]) =>
    ApiException(message: 'failed', statusCode: status, code: code);

void main() {
  group('WorkspaceDeletionRepository', () {
    late _Api api;
    late WorkspaceDeletionRepository repository;

    setUp(() {
      api = _Api();
      repository = WorkspaceDeletionRepository(apiClient: api);
    });

    test('reads the deletion status', () async {
      when(
        () => api.getJson('/api/workspaces/ws-1/deletion-status'),
      ).thenAnswer((_) async => {'status': 'subscription_active'});
      expect(
        await repository.getStatus('ws-1'),
        WorkspaceDeletionStatus.subscriptionActive,
      );
    });

    test('maps refusals and treats 5xx as unavailable', () async {
      for (final (error, status) in [
        (_http(403, 'forbidden'), WorkspaceDeletionStatus.forbidden),
        (_http(404, 'not_found'), WorkspaceDeletionStatus.notFound),
        (_http(500, 'failed'), WorkspaceDeletionStatus.unavailable),
        (_http(503), WorkspaceDeletionStatus.unavailable),
        (
          const ApiException.transport(message: 'offline'),
          WorkspaceDeletionStatus.unavailable,
        ),
      ]) {
        when(
          () => api.getJson('/api/workspaces/ws-1/deletion-status'),
        ).thenThrow(error);
        expect(await repository.getStatus('ws-1'), status);
      }
    });

    test('sends the trimmed confirmation and maps a mismatch', () async {
      when(
        () => api.deleteJson('/api/workspaces/ws-1', body: any(named: 'body')),
      ).thenThrow(_http(400, 'confirmation_mismatch'));
      await expectLater(
        repository.delete(wsId: 'ws-1', confirmation: ' Acme '),
        throwsA(
          isA<WorkspaceDeletionException>().having(
            (error) => error.confirmationMismatch,
            'mismatch',
            isTrue,
          ),
        ),
      );
      verify(
        () => api.deleteJson(
          '/api/workspaces/ws-1',
          body: {'confirmation': 'Acme'},
        ),
      ).called(1);
    });
  });

  group('WorkspaceDeletionSheet', () {
    late _Repository repository;

    setUp(() {
      repository = _Repository();
      when(
        () => repository.getStatus('ws-1'),
      ).thenAnswer((_) async => WorkspaceDeletionStatus.ready);
    });

    Future<void> pumpSheet(WidgetTester tester) async {
      await pumpAdminSurface(
        tester,
        WorkspaceDeletionSheet(workspace: _workspace, repository: repository),
      );
      await tester.pumpAndSettle();
    }

    AppButton confirm(WidgetTester tester) => tester.widget<AppButton>(
      find.byKey(const ValueKey('workspace-delete-confirm')),
    );

    testWidgets('enables deletion only for the exact workspace name', (
      tester,
    ) async {
      await pumpSheet(tester);
      expect(find.textContaining('permanently deleted'), findsOneWidget);
      expect(confirm(tester).onPressed, isNull);

      final field = find.byKey(const ValueKey('workspace-delete-name'));
      await tester.enterText(field, 'acme studio');
      await tester.pump();
      expect(confirm(tester).onPressed, isNull);

      await tester.enterText(field, 'Acme Studio ');
      await tester.pump();
      expect(confirm(tester).onPressed, isNotNull);
    });

    testWidgets('a server failure shows a friendly retryable message', (
      tester,
    ) async {
      when(
        () => repository.delete(
          wsId: 'ws-1',
          confirmation: any(named: 'confirmation'),
        ),
      ).thenThrow(
        const WorkspaceDeletionException(WorkspaceDeletionStatus.unavailable),
      );
      await pumpSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('workspace-delete-name')),
        'Acme Studio',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('workspace-delete-confirm')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          "Workspace deletion isn't available right now. "
          'Please try again later.',
        ),
        findsOneWidget,
      );
      expect(confirm(tester).onPressed, isNotNull);
    });

    testWidgets('blocked workspaces explain why and hide the action', (
      tester,
    ) async {
      when(
        () => repository.getStatus('ws-1'),
      ).thenAnswer((_) async => WorkspaceDeletionStatus.protected);
      await pumpSheet(tester);
      expect(
        find.text('Deletion is locked for this workspace.'),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('workspace-delete-confirm')),
        findsNothing,
      );
    });

    testWidgets('an unreachable status check offers a retry', (tester) async {
      when(
        () => repository.getStatus('ws-1'),
      ).thenAnswer((_) async => WorkspaceDeletionStatus.unavailable);
      await pumpSheet(tester);
      expect(find.text('Retry'), findsOneWidget);
      when(
        () => repository.getStatus('ws-1'),
      ).thenAnswer((_) async => WorkspaceDeletionStatus.ready);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('workspace-delete-name')),
        findsOneWidget,
      );
    });

    testWidgets('a successful deletion resolves true', (tester) async {
      when(
        () => repository.delete(
          wsId: 'ws-1',
          confirmation: any(named: 'confirmation'),
        ),
      ).thenAnswer((_) async {});
      bool? result;
      await pumpAdminSurface(
        tester,
        Builder(
          builder: (context) => WorkspaceDangerZoneSection(
            onDelete: () async {
              result = await showWorkspaceDeletionSheet(
                context: context,
                workspace: _workspace,
                repository: repository,
              );
            },
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('settings-workspace-delete')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('workspace-delete-name')),
        'Acme Studio',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('workspace-delete-confirm')));
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });
  });
}
