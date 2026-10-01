/// A login presentation preference, never an account authorization rule.
enum LoginEmailMode { otp, password }

class LoginEmailModePreference {
  final _choices = <String, LoginEmailMode>{};

  void choose(String email, LoginEmailMode mode) {
    _choices[email.trim().toLowerCase()] = mode;
  }

  LoginEmailMode resolve(String email, {required bool otpEnabled}) {
    if (!otpEnabled) return LoginEmailMode.password;
    final normalized = email.trim().toLowerCase();
    if (RegExp(r'\s').hasMatch(normalized)) return LoginEmailMode.otp;
    final choice = _choices[normalized];
    if (choice != null) return choice;
    final parts = normalized.split('@');
    return parts.length == 2 &&
            parts.first.isNotEmpty &&
            (parts.last == 'tuturuuu.com' || parts.last == 'tutur3u.com')
        ? LoginEmailMode.password
        : LoginEmailMode.otp;
  }
}
