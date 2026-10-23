import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/media/profile_media_optimizer.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_media_failure_message.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

class _Repository extends ProfileRepository {
  String? banner;
  int reloads = 0;
  @override
  String? getCurrentUserIdSync() => 'actor';
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async {
    reloads++;
    return (profile: UserProfile(id: 'actor', bannerUrl: banner), error: null);
  }

  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: null, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async {}
  @override
  Future<ProfileMediaResult> saveBannerResult(File file) async {
    banner = file.path;
    return const ProfileMediaResult.success();
  }

  @override
  Future<ProfileMediaResult> removeBannerResult() async {
    banner = null;
    return const ProfileMediaResult.success();
  }
}

void main() {
  test(
    'upload, replace and remove each reload the authoritative banner',
    () async {
      ProfileCubit.clearMemoryCache();
      final repository = _Repository();
      final cubit = ProfileCubit(profileRepository: repository);
      addTearDown(cubit.close);
      await cubit.loadProfile();
      expect(await cubit.uploadBanner(File('/first.png')), isTrue);
      expect(cubit.state.profile?.bannerUrl, '/first.png');
      expect(await cubit.uploadBanner(File('/replacement.png')), isTrue);
      expect(cubit.state.profile?.bannerUrl, '/replacement.png');
      expect(await cubit.removeBanner(), isTrue);
      expect(cubit.state.profile?.bannerUrl, isNull);
      expect(repository.reloads, 4);
    },
  );

  for (final (error, kind) in <(Object, ProfileMediaFailureKind)>[
    (const ProfileMediaSizeException('private'), ProfileMediaFailureKind.size),
    (
      const ApiException.transport(message: 'private'),
      ProfileMediaFailureKind.network,
    ),
    (
      const ApiException(
        message: 'private',
        statusCode: 401,
        code: 'PROFILE_UPLOAD_TICKET_EXPIRED',
      ),
      ProfileMediaFailureKind.expired,
    ),
    (
      const ApiException(message: 'private', statusCode: 403),
      ProfileMediaFailureKind.authorization,
    ),
  ]) {
    test('$kind produces scoped bilingual guidance without raw errors', () {
      final failure = ProfileMediaFailure.capture(error);
      expect(failure.kind, kind);
      for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
        final message = profileMediaFailureMessage(l10n, failure);
        expect(message, isNotEmpty);
        expect(message, isNot(contains('private')));
        expect(message, isNot(l10n.profileUpdateError));
      }
    });
  }
}
