import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

class AppleIdentityTokens {
  const AppleIdentityTokens({
    required this.idToken,
    required this.rawNonce,
    this.email,
    this.givenName,
    this.familyName,
  });

  final String idToken;
  final String rawNonce;
  final String? email;
  final String? givenName;
  final String? familyName;
}

abstract interface class AppleIdentityClient {
  Future<bool> isAvailable();

  Future<AppleIdentityTokens> authenticate();
}

class AppleIdentityClientImpl implements AppleIdentityClient {
  const AppleIdentityClientImpl();

  @override
  Future<bool> isAvailable() => SignInWithApple.isAvailable();

  @override
  Future<AppleIdentityTokens> authenticate() async {
    final rawNonce = generateNonce();
    final hashedNonce = sha256.convert(utf8.encode(rawNonce)).toString();
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: const <AppleIDAuthorizationScopes>[
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      nonce: hashedNonce,
    );

    final idToken = credential.identityToken;
    if (idToken == null || idToken.isEmpty) {
      throw const SignInWithAppleAuthorizationException(
        code: AuthorizationErrorCode.invalidResponse,
        message: 'No identity token returned by Sign in with Apple.',
      );
    }

    return AppleIdentityTokens(
      idToken: idToken,
      rawNonce: rawNonce,
      email: credential.email,
      givenName: credential.givenName,
      familyName: credential.familyName,
    );
  }
}
