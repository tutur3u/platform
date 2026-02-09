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
  String get tasksAllCaughtUp => 'Đã hoàn thành tất cả!';

  @override
  String get tasksAllCaughtUpSubtitle => 'Không có công việc cần xử lý';

  @override
  String get tasksOverdue => 'Quá hạn';

  @override
  String get tasksDueToday => 'Hôm nay';

  @override
  String get tasksUpcoming => 'Sắp tới';

  @override
  String get tasksPriorityCritical => 'Nghiêm trọng';

  @override
  String get tasksPriorityHigh => 'Cao';

  @override
  String get tasksPriorityNormal => 'Bình thường';

  @override
  String get tasksPriorityLow => 'Thấp';

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
  String get financeRecentTransactions => 'Giao dịch gần đây';

  @override
  String get financeNoWallets => 'Chưa có ví';

  @override
  String get financeNoTransactions => 'Chưa có giao dịch';

  @override
  String get financeIncome => 'Thu nhập';

  @override
  String get financeExpense => 'Chi tiêu';

  @override
  String get financeViewAll => 'Xem tất cả';

  @override
  String get financeSearchTransactions => 'Tìm kiếm giao dịch';

  @override
  String get financeNoSearchResults => 'Không tìm thấy giao dịch';

  @override
  String get timerTitle => 'Bấm giờ';

  @override
  String get timerStart => 'Bắt đầu';

  @override
  String get timerStop => 'Dừng';

  @override
  String get timerHistory => 'Lịch sử';

  @override
  String get timerRunning => 'Đang chạy';

  @override
  String get timerPaused => 'Tạm dừng';

  @override
  String get timerStopped => 'Đã dừng';

  @override
  String get timerPause => 'Tạm dừng';

  @override
  String get timerResume => 'Tiếp tục';

  @override
  String get timerSessionTitle => 'Tiêu đề phiên';

  @override
  String get timerCategory => 'Danh mục';

  @override
  String get timerNoCategory => 'Không có danh mục';

  @override
  String get timerAddCategory => 'Thêm danh mục';

  @override
  String get timerCategoryName => 'Tên danh mục';

  @override
  String get timerRecentSessions => 'Phiên gần đây';

  @override
  String get timerSeeAll => 'Xem tất cả';

  @override
  String get timerNoSessions => 'Chưa có phiên nào';

  @override
  String get timerToday => 'Hôm nay';

  @override
  String get timerThisWeek => 'Tuần này';

  @override
  String get timerThisMonth => 'Tháng này';

  @override
  String get timerStreak => 'Chuỗi ngày';

  @override
  String get timerStatsTitle => 'Thống kê';

  @override
  String get timerActivityHeatmap => 'Hoạt động';

  @override
  String get timerEditSession => 'Sửa phiên';

  @override
  String get timerDeleteSession => 'Xóa phiên';

  @override
  String get timerDeleteConfirm => 'Xóa phiên này?';

  @override
  String get timerAddMissedEntry => 'Thêm mục bị thiếu';

  @override
  String get timerStartTime => 'Thời gian bắt đầu';

  @override
  String get timerEndTime => 'Thời gian kết thúc';

  @override
  String get timerDuration => 'Thời lượng';

  @override
  String get timerSave => 'Lưu';

  @override
  String get timerPomodoro => 'Pomodoro';

  @override
  String get timerPomodoroSettings => 'Cài đặt Pomodoro';

  @override
  String get timerFocusTime => 'Thời gian tập trung';

  @override
  String get timerShortBreak => 'Nghỉ ngắn';

  @override
  String get timerLongBreak => 'Nghỉ dài';

  @override
  String get timerSessionsUntilLong => 'Phiên trước khi nghỉ dài';

  @override
  String get timerRequestsTitle => 'Yêu cầu';

  @override
  String get timerRequestPending => 'Đang chờ';

  @override
  String get timerRequestApproved => 'Đã duyệt';

  @override
  String get timerRequestRejected => 'Bị từ chối';

  @override
  String get timerRequestNeedsInfo => 'Cần thêm thông tin';

  @override
  String get timerApprove => 'Duyệt';

  @override
  String get timerReject => 'Từ chối';

  @override
  String get timerRequestInfo => 'Yêu cầu thông tin';

  @override
  String get timerManagementTitle => 'Quản lý';

  @override
  String get timerTotalSessions => 'Tổng số phiên';

  @override
  String get timerActiveUsers => 'Người dùng hoạt động';

  @override
  String timerDays(int count) {
    return '$count ngày';
  }

  @override
  String get settingsTitle => 'Cài đặt';

  @override
  String get settingsProfile => 'Hồ sơ';

  @override
  String get settingsLanguage => 'Ngôn ngữ';

  @override
  String get settingsLanguageSystem => 'Mặc định hệ thống';

  @override
  String get settingsLanguageEnglish => 'Tiếng Anh';

  @override
  String get settingsLanguageVietnamese => 'Tiếng Việt';

  @override
  String get settingsTheme => 'Giao diện';

  @override
  String get settingsThemeLight => 'Sáng';

  @override
  String get settingsThemeDark => 'Tối';

  @override
  String get settingsThemeSystem => 'Hệ thống';

  @override
  String get settingsSwitchWorkspace => 'Chuyển không gian làm việc';

  @override
  String get settingsSignOut => 'Đăng xuất';

  @override
  String get settingsSignOutConfirm => 'Bạn có chắc muốn đăng xuất không?';

  @override
  String get profileTitle => 'Hồ sơ';

  @override
  String get profileAvatar => 'Ảnh đại diện';

  @override
  String get profileAvatarDescription => 'Tải lên ảnh đại diện của bạn';

  @override
  String get profileUploadAvatar => 'Tải lên ảnh đại diện';

  @override
  String get profileChangeAvatar => 'Thay đổi ảnh đại diện';

  @override
  String get profileRemoveAvatar => 'Xóa ảnh đại diện';

  @override
  String get profileRemoveConfirm => 'Xóa ảnh đại diện?';

  @override
  String get profileAccountStatus => 'Trạng thái tài khoản';

  @override
  String get profileActive => 'Hoạt động';

  @override
  String get profileVerified => 'Đã xác thực';

  @override
  String get profileMemberSince => 'Thành viên từ';

  @override
  String get profileDisplayName => 'Tên hiển thị';

  @override
  String get profileDisplayNameHint => 'Tên hiển thị của bạn';

  @override
  String get profileFullName => 'Tên đầy đủ';

  @override
  String get profileFullNameHint => 'Tên đầy đủ của bạn';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileCurrentEmail => 'Email hiện tại';

  @override
  String get profileNewEmail => 'Email mới';

  @override
  String get profileEmailUpdateNote => 'Email xác nhận sẽ được gửi đến cả hai địa chỉ';

  @override
  String get profileUpdateSuccess => 'Cập nhật hồ sơ thành công';

  @override
  String get profileUpdateError => 'Không thể cập nhật hồ sơ';

  @override
  String get profileAvatarUpdateSuccess => 'Cập nhật ảnh đại diện thành công';

  @override
  String get profileAvatarUpdateError => 'Không thể cập nhật ảnh đại diện';

  @override
  String get profileAvatarRemoveSuccess => 'Đã xóa ảnh đại diện';

  @override
  String get profileAvatarRemoveError => 'Không thể xóa ảnh đại diện';

  @override
  String get profileLoading => 'Đang tải hồ sơ...';

  @override
  String get profileSave => 'Lưu';

  @override
  String get profileCancel => 'Hủy';

  @override
  String get workspacePickerTitle => 'Chuyển không gian làm việc';

  @override
  String get workspacePersonalBadge => 'Cá nhân';

  @override
  String get mfaTitle => 'Xác thực hai yếu tố';

  @override
  String get mfaSubtitle => 'Nhập mã từ ứng dụng xác thực của bạn';

  @override
  String get mfaVerify => 'Xác thực';

  @override
  String get mfaInvalidCode => 'Mã xác thực không hợp lệ. Vui lòng thử lại.';

  @override
  String get mfaSignOut => 'Đăng xuất';

  @override
  String get captchaError => 'Kiểm tra bảo mật thất bại. Vui lòng thử lại.';

  @override
  String get commonRetry => 'Thử lại';
}
