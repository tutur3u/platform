enum AppFlavor {
  development,
  staging,
  production
  ;

  String get value => switch (this) {
    AppFlavor.development => 'development',
    AppFlavor.staging => 'staging',
    AppFlavor.production => 'production',
  };
}
