import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  group('WorkspaceRepository.getWorkspaces', () {
    late _MockApiClient apiClient;
    late WorkspaceRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      repository = WorkspaceRepository(apiClient: apiClient);
    });

    test('preserves API tiers and personal metadata', () async {
      when(
        () => apiClient.getJsonList('/api/v1/workspaces'),
      ).thenAnswer(
        (_) async => [
          {
            'id': 'personal-ws',
            'name': 'Alex Nguyen',
            'personal': true,
            'avatar_url': 'avatars/alex.png',
            'tier': 'PLUS',
          },
          {
            'id': 'team-ws',
            'name': 'Product',
            'personal': false,
            'tier': 'ENTERPRISE',
          },
          {
            'id': 'design-ws',
            'name': 'Design',
            'personal': false,
            'tier': 'PRO',
          },
        ],
      );

      final workspaces = await repository.getWorkspaces();

      expect(workspaces, hasLength(3));
      expect(workspaces[0].name, 'Alex Nguyen');
      expect(workspaces[0].personal, isTrue);
      expect(workspaces[0].tier, workspaceTierPlus);
      expect(workspaces[1].tier, workspaceTierEnterprise);
      expect(workspaces[2].tier, workspaceTierPro);
      expect(
        workspaces[0].avatarUrl,
        contains('/storage/v1/object/public/avatars/avatars/alex.png'),
      );
    });

    test('defaults missing API tier to free', () async {
      when(
        () => apiClient.getJsonList('/api/v1/workspaces'),
      ).thenAnswer(
        (_) async => [
          {
            'id': 'ws-free',
            'name': 'Operations',
            'personal': false,
          },
        ],
      );

      final workspaces = await repository.getWorkspaces();

      expect(workspaces.single.tier, workspaceTierFree);
    });
  });
}
