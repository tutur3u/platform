import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockClient extends Mock implements SupabaseClient {}

class _MockApi extends Mock implements ApiClient {}

void main() {
  test(
    'refuses Microsoft linking before reading a session or launching OAuth',
    () async {
      final client = _MockClient();
      final repository = AccountSecurityRepository(
        client: client,
        api: _MockApi(),
      );
      await expectLater(
        repository.link(OAuthProvider.azure),
        throwsA(isA<AuthException>()),
      );
      verifyZeroInteractions(client);
    },
  );
}
