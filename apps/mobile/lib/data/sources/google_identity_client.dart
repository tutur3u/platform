import 'package:google_sign_in/google_sign_in.dart';

class GoogleIdentityTokens {
  const GoogleIdentityTokens({
    required this.idToken,
    this.accessToken,
  });

  final String idToken;
  final String? accessToken;
}

abstract interface class GoogleIdentityClient {
  Future<void> initialize({
    String? clientId,
    String? serverClientId,
  });

  bool supportsAuthenticate();

  Future<GoogleIdentityTokens> authenticate();

  Future<void> signOut();
}

class GoogleIdentityClientImpl implements GoogleIdentityClient {
  GoogleIdentityClientImpl({
    GoogleSignIn? googleSignIn,
  }) : _googleSignIn = googleSignIn ?? GoogleSignIn.instance;

  final GoogleSignIn _googleSignIn;
  Future<void>? _initializeFuture;

  @override
  Future<void> initialize({
    String? clientId,
    String? serverClientId,
  }) {
    return _initializeFuture ??= _googleSignIn.initialize(
      clientId: clientId,
      serverClientId: serverClientId,
    );
  }

  @override
  bool supportsAuthenticate() => _googleSignIn.supportsAuthenticate();

  @override
  Future<GoogleIdentityTokens> authenticate() async {
    final account = await _googleSignIn.authenticate();
    final idToken = account.authentication.idToken;

    if (idToken == null) {
      throw const GoogleSignInException(
        code: GoogleSignInExceptionCode.unknownError,
        description: 'No ID token returned by Google Sign-In.',
      );
    }

    final authorization = await account.authorizationClient
        .authorizationForScopes(const <String>[]);

    return GoogleIdentityTokens(
      idToken: idToken,
      accessToken: authorization?.accessToken,
    );
  }

  @override
  Future<void> signOut() => _googleSignIn.signOut();
}
