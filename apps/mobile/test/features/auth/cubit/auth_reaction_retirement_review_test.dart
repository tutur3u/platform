import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../assistant/cubit/assistant_chat_persistence_actions_harness.dart';

class _Repository extends Mock implements AuthRepository {}

class _ObservedAuthCubit extends AuthCubit {
  _ObservedAuthCubit({
    required AuthRepository repository,
    required this.onSignedOutState,
  }) : super(authRepository: repository);
  final void Function() onSignedOutState;

  @override
  void onChange(Change<AuthState> change) {
    if (change.nextState.status == AuthStatus.unauthenticated) {
      onSignedOutState();
    }
    super.onChange(change);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/path_provider');
  const actor = supa.User(
    id: actionActor,
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  const nextActor = supa.User(
    id: actionOther,
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  final key = AssistantReactionJournal.keyFor(
    actionActor,
    actionWorkspace,
    actionChat,
    actionMessage,
  );
  final otherKey = AssistantReactionJournal.keyFor(
    actionOther,
    actionWorkspace,
    actionChat,
    actionMessage,
  );

  for (final addAccountFlow in [false, true]) {
    test('signedOut fences outgoing actor before emit and removes metadata '
        '(add account=$addAccountFlow)', () async {
      final directory = await Directory.systemTemp.createTemp(
        'auth-retirement-',
      );
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(channel, (call) async {
              expect(call.method, 'getApplicationSupportDirectory');
              return directory.path;
            });
      final events = StreamController<supa.AuthState>(sync: true);
      final repo = _Repository();
      when(repo.getCurrentUserSync).thenReturn(actor);
      when(repo.checkMfaRequired).thenReturn(false);
      when(repo.onAuthStateChange).thenAnswer((_) => events.stream);
      when(
        repo.getStoredAccounts,
      ).thenAnswer((_) async => <StoredAuthAccount>[]);
      when(repo.getActiveStoredAccountId).thenAnswer((_) async => null);
      when(repo.syncCurrentSessionToMultiAccountStore).thenAnswer((_) async {});
      when(repo.refreshSession).thenAnswer((_) async {});
      when(repo.dispose).thenReturn(null);
      final journal = AssistantReactionJournal();
      _ObservedAuthCubit? cubit;
      addTearDown(() async {
        final owned = cubit;
        if (owned != null && !owned.isClosed) await owned.close();
        await events.close();
        if (Hive.isBoxOpen('assistant_reaction_pending_v1')) {
          await Hive.box<dynamic>('assistant_reaction_pending_v1').close();
        }
        messenger.setMockMethodCallHandler(channel, null);
        await directory.delete(recursive: true);
      });
      expect(
        await journal.begin(key, intent: actionIntent, isCurrent: () => true),
        AssistantReactionBegin.recorded,
      );
      const otherIntent = AssistantReactionIntent(
        opId: actionSuccessorOp,
        emoji: 'star',
        present: false,
      );
      expect(
        await journal.begin(
          otherKey,
          intent: otherIntent,
          isCurrent: () => true,
        ),
        AssistantReactionBegin.recorded,
      );
      final epochBefore = AssistantReactionJournal.actorEpoch(actionActor);
      final otherEpoch = AssistantReactionJournal.actorEpoch(actionOther);
      int? epochAtEmit;
      final auth = _ObservedAuthCubit(
        repository: repo,
        onSignedOutState: () {
          epochAtEmit = AssistantReactionJournal.actorEpoch(actionActor);
        },
      );
      cubit = auth;
      await Future<void>.delayed(Duration.zero);
      if (addAccountFlow) auth.setAddAccountFlow(enabled: true);
      expect(auth.state.user?.id, actionActor);
      // The auth provider has already moved; cleanup must use state.user.
      when(repo.getCurrentUserSync).thenReturn(nextActor);
      events.add(const supa.AuthState(supa.AuthChangeEvent.signedOut, null));
      expect(AssistantReactionJournal.actorEpoch(actionActor), epochBefore + 1);
      expect(epochAtEmit, epochBefore + 1);
      expect(AssistantReactionJournal.actorEpoch(actionOther), otherEpoch);
      expect(auth.state.status, AuthStatus.unauthenticated);
      expect(auth.state.user, isNull);
      expect(auth.state.isAddAccountFlow, addAccountFlow);
      // This read serializes behind the listener's unawaited durable cleanup.
      expect(await journal.retirementIds(actionActor), [actionOp]);
      expect(await journal.pending(key), isNull);
      expect((await journal.pending(otherKey))!.toJson(), otherIntent.toJson());
      expect(await journal.retirementIds(actionOther), isEmpty);
      final retirementKey =
          'retired::${sha256.convert(utf8.encode(actionActor))}';
      final box = Hive.box<dynamic>('assistant_reaction_pending_v1');
      expect(box.toMap(), {
        retirementKey: [actionOp],
        otherKey: otherIntent.toJson(),
      });
      verifyNever(repo.signOut);
      verifyNever(repo.signOutAllAccounts);
    });
  }
}
