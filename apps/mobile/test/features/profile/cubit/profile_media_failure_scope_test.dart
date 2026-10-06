import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';

class _Repository extends ProfileRepository {
  String? actor = 'actor-a';
  final results = <Completer<ProfileMediaResult>>[];
  @override
  String? getCurrentUserIdSync() => actor;
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async =>
      (profile: actor == null ? null : UserProfile(id: actor!), error: null);
  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: null, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async {}
  @override
  Future<ProfileMediaResult> saveAvatarResult(File file) {
    final result = Completer<ProfileMediaResult>();
    results.add(result);
    return result.future;
  }
}

ProfileMediaResult _failure() => ProfileMediaResult.failure(
  const ApiException(
    message: 'synthetic-private',
    code: 'synthetic-private',
    statusCode: 429,
    retryAfter: 60,
  ),
);
Future<(ProfileCubit, _Repository)> _setup() async {
  ProfileCubit.clearMemoryCache();
  final repository = _Repository();
  final cubit = ProfileCubit(profileRepository: repository);
  await cubit.loadProfile();
  addTearDown(cubit.close);
  return (cubit, repository);
}

void main() {
  test('new media intent clears old metadata and successful recovery '
      'retains no diagnostics', () async {
    final (cubit, repository) = await _setup();
    final first = cubit.uploadAvatar(File('/synthetic/first.png'));
    repository.results[0].complete(_failure());
    expect(await first, isFalse);
    expect(cubit.state.mediaFailure?.diagnostics.status, 429);
    final second = cubit.uploadAvatar(File('/synthetic/new-selection.png'));
    expect(cubit.state.mediaFailure, isNull);
    expect(cubit.state.error, isNull);
    repository.results[1].complete(const ProfileMediaResult.success());
    expect(await second, isTrue);
    expect(cubit.state.mediaFailure, isNull);
    expect(cubit.state.isLoading, isFalse);
  });
  test(
    'departed A failure cannot publish after A to B to A load admission',
    () async {
      final (cubit, repository) = await _setup();
      final old = cubit.uploadAvatar(File('/synthetic/old.png'));
      repository.actor = 'actor-b';
      await cubit.loadProfile();
      expect(cubit.state.mediaFailure, isNull);
      repository.actor = 'actor-a';
      await cubit.loadProfile();
      repository.results[0].complete(_failure());
      expect(await old, isFalse);
      expect(cubit.state.profile?.id, 'actor-a');
      expect(cubit.state.mediaFailure, isNull);
      expect(cubit.state.error, isNull);
      expect(cubit.state.isLoading, isFalse);
    },
  );
  test(
    'stale A completion cannot release or replace B media operation',
    () async {
      final (cubit, repository) = await _setup();
      final old = cubit.uploadAvatar(File('/synthetic/old.png'));
      repository.actor = 'actor-b';
      await cubit.loadProfile();
      final newer = cubit.uploadAvatar(File('/synthetic/new.png'));
      repository.results[0].complete(_failure());
      expect(await old, isFalse);
      expect(cubit.state.isLoading, isTrue);
      expect(cubit.state.mediaFailure, isNull);
      repository.results[1].complete(_failure());
      expect(await newer, isFalse);
      expect(cubit.state.profile?.id, 'actor-b');
      expect(cubit.state.mediaFailure?.diagnostics.status, 429);
      expect(cubit.state.isLoading, isFalse);
      repository.actor = null;
      await cubit.loadProfile();
      expect(cubit.state.mediaFailure, isNull);
    },
  );
}
