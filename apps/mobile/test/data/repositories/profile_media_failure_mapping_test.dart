import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/media/profile_media_optimizer.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/sources/api_exception.dart';

void main() {
  for (final (error, kind) in <(Object, ProfileMediaFailureKind)>[
    (
      const ProfileMediaSizeException('bounded input'),
      ProfileMediaFailureKind.size,
    ),
    (const FormatException('empty or corrupt'), ProfileMediaFailureKind.image),
    (PlatformException(code: 'invalid_image'), ProfileMediaFailureKind.image),
    (
      PlatformException(code: 'photo_access_denied'),
      ProfileMediaFailureKind.authorization,
    ),
    (const FileSystemException('missing'), ProfileMediaFailureKind.file),
    (
      const ApiException(message: 'limit', statusCode: 413),
      ProfileMediaFailureKind.size,
    ),
    (
      const ApiException(message: 'service', statusCode: 503),
      ProfileMediaFailureKind.unavailable,
    ),
    (
      const ApiException.transport(message: 'connection'),
      ProfileMediaFailureKind.network,
    ),
  ]) {
    test('${error.runtimeType} maps to ${kind.name}', () {
      expect(ProfileMediaFailure.capture(error).kind, kind);
    });
  }
}
