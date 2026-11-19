@Timeout(Duration(seconds: 45))
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();
  setUpAll(CacheStore.instance.init);

  testWidgets('a warm snapshot renders while revalidation is pending', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    final page = await repo.getMyTasks(
      wsId: 'demo-workspace',
      isPersonal: false,
    );
    final ready = Completer<void>();
    repo.delayMine = ready.future;
    final key = TaskListCubit.offlineSummaryKey(
      'demo-workspace',
      isPersonal: false,
      userId: demoActor.id,
    );
    await tester.runAsync(
      () => CacheStore.instance.write(
        key: key,
        policy: CachePolicies.summary,
        payload: page.toJson(),
      ),
    );
    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    expect(find.text('Review launch checklist'), findsOneWidget);
    expect(repo.openedBoards, isEmpty);
    ready.complete();
    await waitForFreshMyTasks(tester);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
