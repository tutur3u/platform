// dart format off
// coverage:ignore-file

// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class AppLocalizationsVi extends AppLocalizations {
  AppLocalizationsVi([String locale = 'vi']) : super(locale);

  @override
  String get appTitle => 'Tuturuuu';

  @override
  String get counterAppBarTitle => 'Bộ đếm';

  @override
  String get loginTitle => 'Chào mừng trở lại';

  @override
  String get loginSubtitle => 'Đăng nhập để tiếp tục';

  @override
  String get loginTabOtp => 'OTP';

  @override
  String get loginTabPassword => 'Mật khẩu';

  @override
  String get loginSendOtp => 'Gửi OTP';

  @override
  String get loginVerifyOtp => 'Xác thực OTP';

  @override
  String loginRetryAfter(int seconds) {
    return 'Thử lại sau $seconds giây';
  }

  @override
  String get loginSignIn => 'Đăng nhập';

  @override
  String get loginForgotPassword => 'Quên mật khẩu?';

  @override
  String get loginSignUpPrompt => 'Chưa có tài khoản? Đăng ký';

  @override
  String get emailLabel => 'Email';

  @override
  String get passwordLabel => 'Mật khẩu';

  @override
  String get signUpTitle => 'Tạo tài khoản';

  @override
  String get signUpButton => 'Tạo tài khoản';

  @override
  String get signUpConfirmPassword => 'Xác nhận mật khẩu';

  @override
  String get signUpPasswordMinLength => 'Mật khẩu phải có ít nhất 8 ký tự';

  @override
  String get signUpPasswordUppercase => 'Mật khẩu phải chứa chữ hoa';

  @override
  String get signUpPasswordLowercase => 'Mật khẩu phải chứa chữ thường';

  @override
  String get signUpPasswordNumber => 'Mật khẩu phải chứa số';

  @override
  String get signUpPasswordMismatch => 'Mật khẩu không khớp';

  @override
  String get signUpSuccessTitle => 'Kiểm tra email';

  @override
  String get signUpSuccessMessage => 'Chúng tôi đã gửi liên kết xác nhận đến email của bạn. Vui lòng xác minh để tiếp tục.';

  @override
  String get signUpBackToLogin => 'Quay lại đăng nhập';

  @override
  String get forgotPasswordTitle => 'Đặt lại mật khẩu';

  @override
  String get forgotPasswordDescription => 'Nhập email và chúng tôi sẽ gửi cho bạn liên kết đặt lại mật khẩu.';

  @override
  String get forgotPasswordSendReset => 'Gửi liên kết đặt lại';

  @override
  String get forgotPasswordSentTitle => 'Đã gửi email';

  @override
  String get forgotPasswordSentMessage => 'Kiểm tra hộp thư đến để tìm liên kết đặt lại mật khẩu.';

  @override
  String get forgotPasswordBackToLogin => 'Quay lại đăng nhập';

  @override
  String get workspaceSelectTitle => 'Chọn không gian làm việc';

  @override
  String get workspaceSelectEmpty => 'Không tìm thấy không gian làm việc';

  @override
  String get navHome => 'Trang chủ';

  @override
  String get navTasks => 'Công việc';

  @override
  String get navCalendar => 'Lịch';

  @override
  String get navFinance => 'Tài chính';

  @override
  String get navTimer => 'Bấm giờ';

  @override
  String get navSettings => 'Cài đặt';

  @override
  String get dashboardGreeting => 'Chào mừng trở lại!';

  @override
  String get dashboardQuickActions => 'Thao tác nhanh';

  @override
  String get tasksTitle => 'Công việc';

  @override
  String get tasksEmpty => 'Chưa có công việc';

  @override
  String get tasksCreate => 'Tạo công việc';

  @override
  String get calendarTitle => 'Lịch';

  @override
  String get calendarEmpty => 'Không có sự kiện';

  @override
  String get financeTitle => 'Tài chính';

  @override
  String get financeWallets => 'Ví';

  @override
  String get financeTransactions => 'Giao dịch';

  @override
  String get financeCategories => 'Danh mục';

  @override
  String get timerTitle => 'Bấm giờ';

  @override
  String get timerStart => 'Bắt đầu';

  @override
  String get timerStop => 'Dừng';

  @override
  String get timerHistory => 'Lịch sử';

  @override
  String get settingsTitle => 'Cài đặt';

  @override
  String get settingsProfile => 'Hồ sơ';

  @override
  String get settingsTheme => 'Giao diện';

  @override
  String get settingsThemeLight => 'Sáng';

  @override
  String get settingsThemeDark => 'Tối';

  @override
  String get settingsThemeSystem => 'Hệ thống';

  @override
  String get settingsSignOut => 'Đăng xuất';

  @override
  String get settingsSignOutConfirm => 'Bạn có chắc muốn đăng xuất không?';
}
