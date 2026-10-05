import 'package:mobile/core/cache/scoped_cache_access.dart';
import 'package:mobile/data/sources/api_client.dart';

bool timelineAccessDenied(ApiException error) =>
    error.statusCode == 401 ||
    error.statusCode == 403 &&
        !error.isVerificationRequired &&
        error.code != 'MFA_REQUIRED';

/// Retains the existing Profile marker namespace across upgrades.
class ProfileTimelineAccess extends ScopedCacheAccess {
  ProfileTimelineAccess(super.storage)
    : super(markerPrefix: 'profile-timeline-denied-v1');
}
