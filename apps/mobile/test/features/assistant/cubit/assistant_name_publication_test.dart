import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_soul_snapshot.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements AssistantRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late AssistantShellCubit cubit;
  late int epoch;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    epoch = 0;
    when(
      repository.resolvePersonalWorkspaceId,
    ).thenAnswer((_) async => 'personal');
    when(repository.fetchSoul).thenAnswer((_) async => const AssistantSoul());
    when(
      () => repository.fetchTasksInsight(
        wsId: any(named: 'wsId'),
        isPersonal: any(named: 'isPersonal'),
      ),
    ).thenAnswer((_) async => const AssistantTasksInsight());
    when(
      () => repository.fetchCalendarInsight(any()),
    ).thenAnswer((_) async => const AssistantCalendarInsight());
    when(
      () => repository.fetchCredits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => const AssistantCredits());
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
    cubit = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => 'actor-a'),
      currentScopeToken: () => epoch,
    );
    await cubit.loadWorkspace(const Workspace(id: 'ws'));
  });
  tearDown(() => cubit.close());
  test('rename reply is fenced after workspace A B A reselection', () async {
    final reply = Completer<AssistantSoul>();
    when(() => repository.updateSoulNameSnapshot('Old')).thenAnswer(
      (_) async => AssistantSoulSnapshot(verifiedSoul: await reply.future),
    );
    final pending = cubit.renameAssistant('Old');
    await cubit.loadWorkspace(const Workspace(id: 'other'));
    await cubit.loadWorkspace(const Workspace(id: 'ws'));
    reply.complete(const AssistantSoul(name: 'Old'));
    await pending;
    expect(cubit.state.soul.name, 'Mira');
  });
  test('rename reply is fenced after same actor scope departure', () async {
    final reply = Completer<AssistantSoul>();
    when(() => repository.updateSoulNameSnapshot('Old')).thenAnswer(
      (_) async => AssistantSoulSnapshot(verifiedSoul: await reply.future),
    );
    final pending = cubit.renameAssistant('Old');
    epoch++;
    reply.complete(const AssistantSoul(name: 'Old'));
    await pending;
    expect(cubit.state.soul.name, 'Mira');
  });
  test('new refresh supersedes earlier rename publication', () async {
    final reply = Completer<AssistantSoul>();
    when(() => repository.updateSoulNameSnapshot('Old')).thenAnswer(
      (_) async => AssistantSoulSnapshot(verifiedSoul: await reply.future),
    );
    when(
      () => repository.fetchSoul(forceRefresh: true),
    ).thenAnswer((_) async => const AssistantSoul(name: 'Current'));
    final pending = cubit.renameAssistant('Old');
    await cubit.refreshSoul();
    reply.complete(const AssistantSoul(name: 'Old'));
    await pending;
    expect(cubit.state.soul.name, 'Current');
  });
  test('new rename supersedes earlier held refresh publication', () async {
    final reply = Completer<AssistantSoul>();
    when(
      () => repository.fetchSoul(forceRefresh: true),
    ).thenAnswer((_) => reply.future);
    when(() => repository.updateSoulNameSnapshot('Current')).thenAnswer(
      (_) async => AssistantSoulSnapshot(
        verifiedSoul: const AssistantSoul(name: 'Current'),
      ),
    );
    final pending = cubit.refreshSoul();
    await cubit.renameAssistant('Current');
    reply.complete(const AssistantSoul(name: 'Old'));
    await pending;
    expect(cubit.state.soul.name, 'Current');
  });
}
