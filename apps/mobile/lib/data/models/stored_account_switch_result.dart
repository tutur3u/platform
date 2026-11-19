/// The outcome of restoring an account on this device.
enum StoredAccountSwitchResult {
  switched,
  signInRequired,
  failed;

  bool get success => this == switched;

  String? get error => success ? null : 'Failed to restore session';
}
