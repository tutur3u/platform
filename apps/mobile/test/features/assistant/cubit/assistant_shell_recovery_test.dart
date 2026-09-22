import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements AssistantRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late AssistantShellCubit cubit;
  const workspace = Workspace(id: 'ws', tier: 'PRO');
  const credits = AssistantCredits(tier: 'PRO', remaining: 5000);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    when(
      repository.resolvePersonalWorkspaceId,
    ).thenAnswer((_) async => 'personal');
    when(repository.fetchSoul).thenAnswer((_) async => const AssistantSoul());
    when(
      () => repository.fetchTasksInsight(wsId: 'ws', isPersonal: false),
    ).thenAnswer((_) async => const AssistantTasksInsight());
    when(
      () => repository.fetchCalendarInsight('ws'),
    ).thenThrow(const ApiException(message: 'Not found', statusCode: 404));
    when(
      () => repository.fetchCredits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => credits);
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
    cubit = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => 'user'),
    );
    addTearDown(cubit.close);
  });

  test('missing optional Calendar does not erase Pro balances', () async {
    // Async errors model a real network failure after all requests start.
    when(() => repository.fetchCalendarInsight('ws')).thenAnswer((_) async {
      throw const ApiException(message: 'Not found', statusCode: 404);
    });
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.workspaceCredits, credits);
    expect(cubit.state.workspaceCreditLocked, isFalse);
    expect(cubit.state.activeCredits.tier, 'PRO');
    expect(await cubit.setCreditSource(AssistantCreditSource.personal), isTrue);
    expect(cubit.state.creditSource, AssistantCreditSource.personal);
  });

  test(
    'credit selection failure is recoverable and preserves the source',
    () async {
      when(
        () => repository.fetchCalendarInsight('ws'),
      ).thenAnswer((_) async => const AssistantCalendarInsight());
      await cubit.loadWorkspace(workspace);
      when(() => repository.fetchCredits('personal')).thenAnswer((_) async {
        throw const ApiException(message: 'Unavailable', statusCode: 503);
      });
      expect(
        await cubit.setCreditSource(AssistantCreditSource.personal),
        isFalse,
      );
      expect(cubit.state.creditSource, AssistantCreditSource.workspace);
      expect(cubit.state.status, AssistantShellStatus.error);
      expect(cubit.state.workspaceCredits, credits);
    },
  );
}
