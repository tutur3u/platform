import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';

void main() {
  test(
    'disk cache is limited to public media belonging to the scoped actor',
    () {
      const path =
          '${Env.supabaseUrl}/storage/v1/object/public/banners/actor/banner.jpg';
      expect(cacheableProfileMedia(path, 'actor'), isTrue);
      expect(cacheableProfileMedia(path, 'another'), isFalse);
      expect(cacheableProfileMedia('not-a-url', 'actor'), isFalse);
      expect(cacheableProfileMedia('$path/../../private', 'actor'), isFalse);
      expect(cacheableProfileMedia('$path?token=private', 'actor'), isFalse);
      expect(
        cacheableProfileMedia(path.replaceFirst('/public/', '/sign/'), 'actor'),
        isFalse,
      );
      expect(
        cacheableProfileMedia(
          'https://foreign.test/storage/v1/object/public/banners/actor/a.jpg',
          'actor',
        ),
        isFalse,
      );
    },
  );
}
