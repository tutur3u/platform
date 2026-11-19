@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';

import '../../../helpers/golden_tolerance.dart';
import 'assistant_s5_shell_harness.dart';

/// A workspace with no messages in the open chat and no chat history.
class _EmptyRepository extends AssistantShellFixtureRepository {
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => const [];

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId, title: 'New chat'),
    messages: const [],
    attachmentsByMessageId: const {},
  );
}

void main() {
  setUpAssistantShellHarness();
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/assistant/view/assistant_empty_state_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (scene, route) in [
    ('mira_empty', Routes.assistant),
    ('history_empty', Routes.assistantConversations),
  ]) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        final name = '${scene}_${design}_${brightness.name}_phone';
        testWidgets(name, (tester) async {
          tester.view
            ..physicalSize = const Size(390, 844)
            ..devicePixelRatio = 1
            ..padding = const FakeViewPadding(top: 48, bottom: 34)
            ..viewPadding = const FakeViewPadding(top: 48, bottom: 34);
          addTearDown(tester.view.reset);
          await pumpAssistantShell(
            tester,
            repository: _EmptyRepository(),
            initialLocation: route,
            brightness: brightness,
            sorbet: sorbet,
          );
          expect(
            route == Routes.assistant
                ? find.byType(AssistantEmptyHero)
                : find.byType(AppIllustration),
            findsOneWidget,
          );
          // Linux owns the raster baselines.
          if (Platform.isLinux) {
            await expectLater(
              find.byKey(assistantBoundary),
              matchesGoldenFile('goldens/$name.png'),
            );
          }
        });
      }
    }
  }
}
