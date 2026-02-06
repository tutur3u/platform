// dart format off
// coverage:ignore-file
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_vi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('vi')
  ];

  String get appTitle;
  String get counterAppBarTitle;

  // Auth - Login
  String get loginTitle;
  String get loginSubtitle;
  String get loginTabOtp;
  String get loginTabPassword;
  String get loginSendOtp;
  String get loginVerifyOtp;
  String loginRetryAfter(int seconds);
  String get loginSignIn;
  String get loginForgotPassword;
  String get loginSignUpPrompt;
  String get emailLabel;
  String get passwordLabel;

  // Auth - Sign Up
  String get signUpTitle;
  String get signUpButton;
  String get signUpConfirmPassword;
  String get signUpPasswordMinLength;
  String get signUpPasswordUppercase;
  String get signUpPasswordLowercase;
  String get signUpPasswordNumber;
  String get signUpPasswordMismatch;
  String get signUpSuccessTitle;
  String get signUpSuccessMessage;
  String get signUpBackToLogin;

  // Auth - Forgot Password
  String get forgotPasswordTitle;
  String get forgotPasswordDescription;
  String get forgotPasswordSendReset;
  String get forgotPasswordSentTitle;
  String get forgotPasswordSentMessage;
  String get forgotPasswordBackToLogin;

  // Workspace
  String get workspaceSelectTitle;
  String get workspaceSelectEmpty;

  // Navigation
  String get navHome;
  String get navTasks;
  String get navCalendar;
  String get navFinance;
  String get navTimer;
  String get navSettings;

  // Dashboard
  String get dashboardGreeting;
  String get dashboardQuickActions;

  // Tasks
  String get tasksTitle;
  String get tasksEmpty;
  String get tasksCreate;

  // Calendar
  String get calendarTitle;
  String get calendarEmpty;

  // Finance
  String get financeTitle;
  String get financeWallets;
  String get financeTransactions;
  String get financeCategories;

  // Timer
  String get timerTitle;
  String get timerStart;
  String get timerStop;
  String get timerHistory;

  // Settings
  String get settingsTitle;
  String get settingsProfile;
  String get settingsTheme;
  String get settingsThemeLight;
  String get settingsThemeDark;
  String get settingsThemeSystem;
  String get settingsSignOut;
  String get settingsSignOutConfirm;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'vi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  switch (locale.languageCode) {
    case 'en': return AppLocalizationsEn();
    case 'vi': return AppLocalizationsVi();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
