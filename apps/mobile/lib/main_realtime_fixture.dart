import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/meet/fixtures/meet_capture_fixture.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  if (!kDebugMode) throw StateError('Synthetic meeting requires debug mode');
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: MeetCaptureFixture(),
    ),
  );
}
