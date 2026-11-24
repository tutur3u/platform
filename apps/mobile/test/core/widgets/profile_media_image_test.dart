import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/media/public_storage_media.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';

void main() {
  const gateway =
      'https://project.supabase.co/storage/v1/object/public/banners/actor/b.jpg';
  const cdn = 'https://cdn.tuturuuu.com/banners/actor/b.jpg';

  test(
    'disk cache is limited to public media belonging to the scoped actor',
    () {
      expect(cacheableProfileMedia(gateway, 'actor'), isTrue);
      expect(cacheableProfileMedia(gateway, 'another'), isFalse);
      expect(cacheableProfileMedia('not-a-url', 'actor'), isFalse);
      expect(cacheableProfileMedia('$gateway/../../private', 'actor'), isFalse);
      expect(cacheableProfileMedia('$gateway?token=private', 'actor'), isFalse);
      expect(
        cacheableProfileMedia(
          gateway.replaceFirst('/public/', '/sign/'),
          'actor',
        ),
        isFalse,
      );
      expect(
        cacheableProfileMedia(
          'https://cdn.tuturuuu.com/documents/actor/b.jpg',
          'actor',
        ),
        isFalse,
      );
    },
  );

  test('the storage host is opaque: gateway and CDN share one cache key', () {
    expect(cacheableProfileMedia(cdn, 'actor'), isTrue);
    expect(
      cacheableProfileMedia(
        'https://storage.example.test/storage/v1/object/public/avatars/actor/a.png',
        'actor',
      ),
      isTrue,
    );
    expect(
      profileMediaCacheKey(gateway, 'actor'),
      profileMediaCacheKey(cdn, 'actor'),
    );
    expect(profileMediaCacheKey(cdn, 'actor'), 'profile:banners:actor/b.jpg');
  });

  test(
    'dot-segments resolve before the actor check, so they cannot escape',
    () {
      const escape = 'https://cdn.tuturuuu.com/avatars/actor/../other/x.png';
      const encoded =
          'https://cdn.tuturuuu.com/avatars/actor/%2e%2e/other/x.png';
      expect(cacheableProfileMedia(escape, 'actor'), isFalse);
      expect(cacheableProfileMedia(encoded, 'actor'), isFalse);
      expect(
        profileMediaCacheKey(escape, 'other'),
        'profile:avatars:other/x.png',
      );
    },
  );

  test('public storage media is recognised on any host', () {
    expect(isPublicStorageMediaUrl(gateway), isTrue);
    expect(isPublicStorageMediaUrl(cdn), isTrue);
    expect(
      isPublicStorageMediaUrl('https://cdn.tuturuuu.com/task-media/x.mp4'),
      isTrue,
    );
    expect(isPublicStorageMediaUrl('https://example.test/video.mp4'), isFalse);
    expect(isPublicStorageMediaUrl('$cdn?token=x'), isFalse);
    expect(
      isPublicStorageMediaUrl('https://user:pw@cdn.tuturuuu.com/a/b'),
      isFalse,
    );
  });
}
