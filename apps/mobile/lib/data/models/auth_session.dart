/// Payload returned by the mobile auth API endpoints.
///
/// Mirrors the TypeScript type from apps/native/lib/api/auth.ts.
class AuthSessionPayload {
  const AuthSessionPayload({
    required this.accessToken,
    required this.refreshToken,
    this.expiresIn,
    this.expiresAt,
    this.tokenType,
  });

  factory AuthSessionPayload.fromJson(Map<String, dynamic> json) =>
      AuthSessionPayload(
        accessToken: json['access_token'] as String,
        refreshToken: json['refresh_token'] as String,
        expiresIn: json['expires_in'] as int?,
        expiresAt: json['expires_at'] as int?,
        tokenType: json['token_type'] as String?,
      );

  final String accessToken;
  final String refreshToken;
  final int? expiresIn;
  final int? expiresAt;
  final String? tokenType;

  Map<String, dynamic> toJson() => {
    'access_token': accessToken,
    'refresh_token': refreshToken,
    'expires_in': expiresIn,
    'expires_at': expiresAt,
    'token_type': tokenType,
  };
}
