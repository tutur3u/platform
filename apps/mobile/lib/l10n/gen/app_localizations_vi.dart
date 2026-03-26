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
  String get loginContinueWithEmail => 'Tiếp tục với email';

  @override
  String get loginSignIn => 'Đăng nhập';

  @override
  String get authContinueWithApple => 'Tiếp tục với Apple';

  @override
  String get authContinueWithGoogle => 'Tiếp tục với Google';

  @override
  String get authContinueWithEmail => 'hoặc tiếp tục với email';

  @override
  String get authAppleSignInFailed => 'Đăng nhập Apple thất bại. Vui lòng thử lại.';

  @override
  String get authAppleBrowserLaunchFailed => 'Không thể mở đăng nhập Apple lúc này.';

  @override
  String get authGoogleSignInFailed => 'Đăng nhập Google thất bại. Vui lòng thử lại.';

  @override
  String get authGoogleBrowserLaunchFailed => 'Không thể mở đăng nhập Google lúc này.';

  @override
  String get authLogOut => 'Đăng xuất';

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
  String get signUpSubtitle => 'Tạo tài khoản nhanh hơn với Apple, Google hoặc email.';

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
  String get signUpAlreadyHaveAccountPrompt => 'Đã có tài khoản?';

  @override
  String get signUpSignIn => 'Đăng nhập';

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
  String get workspaceSelectError => 'Không thể chuyển không gian làm việc';

  @override
  String get appUpdateChecking => 'Đang kiểm tra phiên bản ứng dụng...';

  @override
  String get appUpdateNow => 'Cập nhật ngay';

  @override
  String get appUpdateLater => 'Để sau';

  @override
  String get appUpdateRecommendedTitle => 'Có bản cập nhật mới';

  @override
  String get appUpdateRecommendedMessage => 'Đã có phiên bản ứng dụng mới hơn. Hãy cập nhật để nhận các bản sửa lỗi và cải tiến mới nhất.';

  @override
  String get appUpdateRequiredTitle => 'Bắt buộc cập nhật';

  @override
  String get appUpdateRequiredMessage => 'Phiên bản ứng dụng này không còn được hỗ trợ. Vui lòng cập nhật để tiếp tục sử dụng.';

  @override
  String get navHome => 'Trang chủ';

  @override
  String get navTasks => 'Công việc';

  @override
  String get navHabits => 'Thói quen';

  @override
  String get navCalendar => 'Lịch';

  @override
  String get navFinance => 'Tài chính';

  @override
  String get navTimer => 'Bấm giờ';

  @override
  String get navSettings => 'Cài đặt';

  @override
  String get navApps => 'Ứng dụng';

  @override
  String get navAssistant => 'Trợ lý';

  @override
  String get navBack => 'Quay lại';

  @override
  String get navMore => 'Thêm';

  @override
  String get appsHubSearchHint => 'Tìm kiếm ứng dụng';

  @override
  String get appsHubQuickAccess => 'Truy cập nhanh';

  @override
  String get appsHubAllApps => 'Tất cả ứng dụng';

  @override
  String get appsHubEmpty => 'Không tìm thấy ứng dụng';

  @override
  String get appsHubHeroTitle => 'Công cụ không gian làm việc';

  @override
  String get appsHubHeroSubtitle => 'Chọn một công cụ để mở.';

  @override
  String get appsHubFeatured => 'Nổi bật';

  @override
  String get appsHubMoreTools => 'Công cụ khác';

  @override
  String get appsHubSearchResults => 'Kết quả tìm kiếm';

  @override
  String get appsHubOpenApp => 'Mở';

  @override
  String get appsHubTasksDescription => 'Công việc được giao, lập kế hoạch và portfolio.';

  @override
  String get appsHubHabitsDescription => 'Thói quen chung, chuỗi ngày và tiến độ lặp lại.';

  @override
  String get appsHubCalendarDescription => 'Lịch làm việc, sự kiện sắp tới và các chế độ xem lịch.';

  @override
  String get appsHubFinanceDescription => 'Ví, danh mục và lịch sử giao dịch.';

  @override
  String get appsHubTimerDescription => 'Theo dõi phiên, thống kê và yêu cầu.';

  @override
  String get habitsTitle => 'Thói quen';

  @override
  String get habitsOverviewLabel => 'Tổng quan';

  @override
  String get habitsActivityLabel => 'Hoạt động';

  @override
  String get habitsActivityTitle => 'Hoạt động';

  @override
  String get habitsActivitySubtitle => 'Xem các lượt ghi nhận thói quen mới nhất trên mọi bộ theo dõi trong không gian làm việc này.';

  @override
  String get habitsLoadError => 'Không thể tải thói quen lúc này';

  @override
  String get habitsSummarySubtitle => 'Theo dõi các nghi thức, thói quen và động lực chung trong không gian làm việc.';

  @override
  String get habitsSummaryVolume => 'Khối lượng hiện tại';

  @override
  String get habitsSummaryTargetsMet => 'Đạt mục tiêu';

  @override
  String get habitsSummaryTopStreak => 'Chuỗi cao nhất';

  @override
  String get habitsSummaryTrackers => 'Bộ theo dõi';

  @override
  String get habitsScopeSelf => 'Cá nhân';

  @override
  String get habitsScopeTeam => 'Nhóm';

  @override
  String get habitsScopeMember => 'Thành viên';

  @override
  String get habitsMemberPickerLabel => 'Xem thành viên';

  @override
  String get habitsSearchHint => 'Tìm thói quen, nghi thức hoặc chỉ số';

  @override
  String get habitsEmptyTitle => 'Chưa có bộ theo dõi thói quen';

  @override
  String get habitsEmptyDescription => 'Tạo bộ theo dõi đầu tiên để biến thói quen lặp lại thành điều cả không gian làm việc có thể cùng theo dõi.';

  @override
  String get habitsTrackerNoDescription => 'Chưa có mô tả';

  @override
  String get habitsCreateTrackerAction => 'Tạo bộ theo dõi';

  @override
  String get habitsSaveTrackerAction => 'Lưu bộ theo dõi';

  @override
  String get habitsCreateTrackerTitle => 'Tạo bộ theo dõi thói quen';

  @override
  String get habitsEditTrackerTitle => 'Sửa bộ theo dõi thói quen';

  @override
  String get habitsCreateTrackerDescription => 'Thiết lập mục tiêu, trường nhập liệu và thao tác nhanh cho không gian làm việc.';

  @override
  String get habitsEditTrackerDescription => 'Cập nhật cấu trúc bộ theo dõi, mục tiêu và hành vi thêm nhanh.';

  @override
  String get habitsTemplateLabel => 'Bắt đầu từ mẫu';

  @override
  String get habitsNameLabel => 'Tên';

  @override
  String get habitsNameRequired => 'Tên bộ theo dõi là bắt buộc';

  @override
  String get habitsDescriptionLabel => 'Mô tả';

  @override
  String get habitsTrackingModeLabel => 'Chế độ theo dõi';

  @override
  String get habitsModeDailySummary => 'Tổng hợp theo ngày';

  @override
  String get habitsModeEventLog => 'Nhật ký sự kiện';

  @override
  String get habitsAggregationLabel => 'Tổng hợp';

  @override
  String get habitsAggregationSum => 'Cộng dồn';

  @override
  String get habitsAggregationMax => 'Lớn nhất';

  @override
  String get habitsAggregationCountEntries => 'Đếm lượt nhập';

  @override
  String get habitsAggregationBooleanAny => 'Chỉ cần hoàn thành';

  @override
  String get habitsTargetPeriodLabel => 'Chu kỳ mục tiêu';

  @override
  String get habitsPeriodDaily => 'Hàng ngày';

  @override
  String get habitsPeriodWeekly => 'Hàng tuần';

  @override
  String get habitsTargetOperatorLabel => 'Điều kiện mục tiêu';

  @override
  String get habitsTargetOperatorEq => 'Chính xác';

  @override
  String get habitsTargetOperatorGte => 'Ít nhất';

  @override
  String get habitsTargetValueLabel => 'Giá trị mục tiêu';

  @override
  String get habitsTargetValueRequired => 'Giá trị mục tiêu phải lớn hơn 0';

  @override
  String get habitsStartDateLabel => 'Ngày bắt đầu';

  @override
  String get habitsAppearanceLabel => 'Giao diện';

  @override
  String get habitsIconLabel => 'Biểu tượng';

  @override
  String get habitsFieldsTitle => 'Trường dữ liệu';

  @override
  String get habitsFieldsRequired => 'Hãy thêm ít nhất một trường hợp lệ';

  @override
  String get habitsAddField => 'Thêm trường';

  @override
  String get habitsPrimaryMetricLabel => 'Chỉ số chính';

  @override
  String get habitsPrimaryMetricRequired => 'Chọn trường chỉ số chính';

  @override
  String get habitsQuickAddValuesLabel => 'Giá trị thêm nhanh';

  @override
  String get habitsQuickAddValuesHint => 'Ví dụ: 1, 2, 3';

  @override
  String get habitsFreezeAllowanceLabel => 'Số lần đóng băng';

  @override
  String get habitsRecoveryWindowLabel => 'Cửa sổ phục hồi';

  @override
  String get habitsActiveLabel => 'Đang hoạt động';

  @override
  String get habitsFieldKeysUnique => 'Khóa trường phải là duy nhất';

  @override
  String get habitsSelectOptionsRequired => 'Trường chọn phải có ít nhất một tùy chọn';

  @override
  String habitsFieldCardTitle(int count) {
    return 'Trường $count';
  }

  @override
  String get habitsFieldLabel => 'Nhãn trường';

  @override
  String get habitsFieldType => 'Loại trường';

  @override
  String get habitsFieldKey => 'Khóa trường';

  @override
  String get habitsFieldUnit => 'Đơn vị';

  @override
  String get habitsFieldOptions => 'Tùy chọn';

  @override
  String get habitsFieldOptionsHint => 'Ví dụ: dễ, trung bình, khó';

  @override
  String get habitsFieldRequired => 'Trường bắt buộc';

  @override
  String get habitsFieldTypeBoolean => 'Đúng/Sai';

  @override
  String get habitsFieldTypeNumber => 'Số';

  @override
  String get habitsFieldTypeDuration => 'Thời lượng';

  @override
  String get habitsFieldTypeText => 'Văn bản';

  @override
  String get habitsFieldTypeSelect => 'Chọn';

  @override
  String get habitsOverviewTab => 'Tổng quan';

  @override
  String get habitsEntriesTab => 'Lượt nhập';

  @override
  String get habitsLeaderboardTab => 'Bảng xếp hạng';

  @override
  String get habitsLogEntryTitle => 'Ghi nhận lượt nhập';

  @override
  String get habitsLogEntryDescription => 'Lưu cập nhật thói quen mà không cần rời khu vực thói quen.';

  @override
  String get habitsLogEntryAction => 'Ghi nhận';

  @override
  String get habitsCompleteNow => 'Hoàn thành ngay';

  @override
  String get habitsEntryDateLabel => 'Ngày nhập';

  @override
  String get habitsEntryNoteLabel => 'Ghi chú';

  @override
  String get habitsEntryTagsLabel => 'Thẻ';

  @override
  String get habitsEntryTagsHint => 'Các thẻ, ngăn cách bằng dấu phẩy';

  @override
  String get habitsSaveEntry => 'Lưu lượt nhập';

  @override
  String get habitsMarkDone => 'Đánh dấu hoàn thành';

  @override
  String get habitsMarkedDone => 'Đã đánh dấu hoàn thành';

  @override
  String get habitsFormRequiredField => 'Vui lòng điền các trường bắt buộc';

  @override
  String get habitsFormInvalidNumber => 'Hãy nhập một số hợp lệ';

  @override
  String get habitsArchiveTrackerTitle => 'Lưu trữ bộ theo dõi?';

  @override
  String get habitsArchiveTrackerMessage => 'Bộ theo dõi này sẽ bị xóa khỏi danh sách thói quen đang hoạt động.';

  @override
  String get habitsArchiveTrackerAction => 'Lưu trữ bộ theo dõi';

  @override
  String get habitsDeleteEntryTitle => 'Xóa lượt nhập?';

  @override
  String get habitsDeleteEntryMessage => 'Lượt nhập thói quen này sẽ bị xóa vĩnh viễn.';

  @override
  String get habitsDeleteEntryAction => 'Xóa lượt nhập';

  @override
  String get habitsEditTrackerAction => 'Sửa bộ theo dõi';

  @override
  String get habitsCurrentStreak => 'Chuỗi hiện tại';

  @override
  String get habitsBestStreak => 'Chuỗi tốt nhất';

  @override
  String get habitsConsistencyLabel => 'Độ ổn định';

  @override
  String get habitsRecoveryWindowTitle => 'Cửa sổ phục hồi';

  @override
  String get habitsRecoveryWindowDescription => 'Dùng sửa chuỗi hoặc đóng băng khi một chu kỳ chuỗi cần được giữ nguyên.';

  @override
  String get habitsRepairStreakAction => 'Sửa chuỗi';

  @override
  String get habitsUseFreezeAction => 'Dùng đóng băng';

  @override
  String get habitsCurrentPeriodMetricsTitle => 'Chỉ số chu kỳ hiện tại';

  @override
  String habitsEntriesCountLabel(int count) {
    return '$count lượt nhập';
  }

  @override
  String get habitsMemberSummariesTitle => 'Tóm tắt thành viên';

  @override
  String get habitsTeamSummaryTitle => 'Tóm tắt nhóm';

  @override
  String get habitsTopStreakLabel => 'Chuỗi cao nhất';

  @override
  String get habitsEntriesLabel => 'Lượt nhập';

  @override
  String get habitsNoEntries => 'Chưa có lượt nhập';

  @override
  String get habitsNoLeaderboard => 'Chưa có dữ liệu bảng xếp hạng';

  @override
  String get habitsActivityEmptyTitle => 'Chưa có nhật ký';

  @override
  String get habitsActivityEmptyBody => 'Khi ai đó ghi nhận một lượt nhập thói quen, nó sẽ xuất hiện ở đây.';

  @override
  String get habitsActivityNoTrackers => 'Hãy tạo bộ theo dõi thói quen trước để bắt đầu thu thập hoạt động.';

  @override
  String habitsStreakChip(int count) {
    return '$count chuỗi';
  }

  @override
  String habitsTargetChip(double count) {
    return 'Mục tiêu $count';
  }

  @override
  String get habitsTeamMembers => 'Thành viên nhóm';

  @override
  String get habitsTodayTotalHint => 'Tổng hôm nay';

  @override
  String get habitsQuickLogValueRequired => 'Hãy nhập giá trị trước khi lưu';

  @override
  String get habitsMetricMet => 'Đạt';

  @override
  String get habitsMetricPending => 'Chưa đạt';

  @override
  String get assistantComingSoon => 'Sắp ra mắt';

  @override
  String get assistantSelectWorkspace => 'Chọn một không gian làm việc';

  @override
  String get assistantWorkspaceAwareDescription => 'Mira theo ngữ cảnh không gian làm việc cho việc lên kế hoạch, hỏi đáp và thao tác nhanh.';

  @override
  String get assistantHistoryTitle => 'Đoạn chat gần đây';

  @override
  String get assistantUntitledChat => 'Đoạn chat chưa có tiêu đề';

  @override
  String get assistantPersonalWorkspace => 'Cá nhân';

  @override
  String get assistantSettingsTitle => 'Cài đặt Mira';

  @override
  String get assistantActionsTitle => 'Thao tác';

  @override
  String get assistantRenameTitle => 'Đổi tên Mira';

  @override
  String get assistantRenameAction => 'Đổi tên';

  @override
  String get assistantCancelAction => 'Huỷ';

  @override
  String get assistantSaveAction => 'Lưu';

  @override
  String get assistantCreditsTitle => 'Tín dụng';

  @override
  String get assistantConversationTitle => 'Cuộc trò chuyện';

  @override
  String get assistantAttachFilesAction => 'Đính kèm tệp';

  @override
  String get assistantEnterFullscreenAction => 'Vào toàn màn hình';

  @override
  String get assistantExitFullscreenAction => 'Thoát toàn màn hình';

  @override
  String get assistantPersonalCredits => 'Tín dụng cá nhân';

  @override
  String get assistantWorkspaceCredits => 'Tín dụng không gian làm việc';

  @override
  String get assistantTasksLabel => 'Công việc';

  @override
  String get assistantCalendarLabel => 'Lịch';

  @override
  String get assistantActiveLabel => 'đang hoạt động';

  @override
  String get assistantDoneTodayLabel => 'hoàn thành hôm nay';

  @override
  String get assistantUpcomingLabel => 'sắp tới';

  @override
  String get assistantYouLabel => 'Bạn';

  @override
  String get assistantThinkingStatus => 'Đang suy nghĩ...';

  @override
  String get assistantReasoningLabel => 'Lý do';

  @override
  String get assistantAskPlaceholder => 'Hỏi Mira bất cứ điều gì...';

  @override
  String get assistantQueuedPrefix => 'Đang xếp hàng:';

  @override
  String get assistantQuickPromptCalendar => 'Tóm tắt lịch hôm nay của tôi';

  @override
  String get assistantQuickPromptTasks => 'Cho tôi xem các công việc khẩn cấp nhất';

  @override
  String get assistantQuickPromptFocus => 'Giúp tôi lên kế hoạch cho một khối tập trung tiếp theo';

  @override
  String get assistantQuickPromptExpense => 'Ghi nhanh một khoản chi cho bữa trưa';

  @override
  String get assistantNewConversation => 'Cuộc trò chuyện mới';

  @override
  String get assistantExportChat => 'Xuất đoạn chat';

  @override
  String get assistantModelLabel => 'Mô hình';

  @override
  String get assistantModeFast => 'Nhanh';

  @override
  String get assistantModeThinking => 'Suy nghĩ';

  @override
  String get assistantImmersiveLabel => 'Tập trung';

  @override
  String get assistantStandardLabel => 'Tiêu chuẩn';

  @override
  String get assistantViewOnlyLabel => 'Chỉ xem';

  @override
  String get assistantEditableLabel => 'Có thể chỉnh sửa';

  @override
  String get assistantSourceLabel => 'Nguồn';

  @override
  String get assistantToolLabel => 'Công cụ';

  @override
  String get assistantInputLabel => 'Đầu vào';

  @override
  String get assistantOutputLabel => 'Đầu ra';

  @override
  String get assistantSeeMoreLabel => 'Xem thêm';

  @override
  String get assistantSeeLessLabel => 'Thu gọn';

  @override
  String get assistantExportShareText => 'Xuất đoạn chat Mira';

  @override
  String get assistantContextUpdatedLabel => 'Đã cập nhật ngữ cảnh không gian làm việc';

  @override
  String get assistantPreferencesUpdatedLabel => 'Đã cập nhật tuỳ chọn trợ lý';

  @override
  String get assistantShowBottomNavLabel => 'Hiện thanh điều hướng dưới';

  @override
  String get assistantHideBottomNavLabel => 'Ẩn thanh điều hướng dưới';

  @override
  String assistantCreditsSummary(int remaining, String tier) {
    return 'Còn $remaining • $tier';
  }

  @override
  String get dashboardGreeting => 'Chào mừng trở lại!';

  @override
  String get dashboardQuickActions => 'Thao tác nhanh';

  @override
  String get dashboardTodayTitle => 'Tổng quan hôm nay';

  @override
  String get dashboardQuickLaunch => 'Mở nhanh';

  @override
  String get dashboardAssignedToMe => 'Được giao cho tôi';

  @override
  String get dashboardUpcomingEvents => 'Sự kiện sắp tới';

  @override
  String get dashboardOpenTasks => 'Mở';

  @override
  String get dashboardOpenCalendar => 'Mở';

  @override
  String get dashboardNoAssignedTasks => 'Không có công việc đang hoạt động nào được giao cho bạn.';

  @override
  String get dashboardNoAssignedTasksDescription => 'Bạn đang khá trống. Công việc mới sẽ xuất hiện ở đây.';

  @override
  String get dashboardNoUpcomingEvents => 'Không có sự kiện có giờ cụ thể nào trong 7 ngày tới.';

  @override
  String get dashboardNoUpcomingEventsDescription => 'Lịch của bạn hiện khá thoáng.';

  @override
  String get dashboardTaskOverdue => 'Quá hạn';

  @override
  String get dashboardTaskToday => 'Hôm nay';

  @override
  String get dashboardTaskTomorrow => 'Ngày mai';

  @override
  String get dashboardTaskUpcoming => 'Sắp tới';

  @override
  String get dashboardTaskNoDate => 'Không có hạn';

  @override
  String get dashboardEventAllDay => 'Cả ngày';

  @override
  String dashboardTasksMetric(Object count) {
    return '$count đang hoạt động';
  }

  @override
  String dashboardOverdueMetric(Object count) {
    return '$count quá hạn';
  }

  @override
  String dashboardEventsMetric(Object count) {
    return '$count tiếp theo';
  }

  @override
  String get tasksTitle => 'Công việc';

  @override
  String get tasksEmpty => 'Chưa có công việc';

  @override
  String get tasksLoadError => 'Không thể tải công việc lúc này';

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
  String get tasksGoodMorning => 'Chào buổi sáng';

  @override
  String get tasksGoodAfternoon => 'Chào buổi chiều';

  @override
  String get tasksGoodEvening => 'Chào buổi tối';

  @override
  String get tasksGoodNight => 'Chúc ngủ ngon';

  @override
  String get tasksRequiresAttention => 'Cần xử lý ngay';

  @override
  String get tasksCompleteByEndOfDay => 'Hoàn thành trước cuối ngày';

  @override
  String get tasksPlanAhead => 'Lên kế hoạch sớm';

  @override
  String get tasksCompleted => 'Đã hoàn thành';

  @override
  String tasksCompletedCount(int count) {
    return 'Đã hoàn thành $count';
  }

  @override
  String get tasksPriorityCritical => 'Nghiêm trọng';

  @override
  String get tasksPriorityHigh => 'Cao';

  @override
  String get tasksPriorityNormal => 'Bình thường';

  @override
  String get tasksPriorityLow => 'Thấp';

  @override
  String get tasksUntitled => 'Công việc chưa có tiêu đề';

  @override
  String get taskBoardsTitle => 'Bảng';

  @override
  String get taskBoardsCreate => 'Tạo bảng';

  @override
  String get taskBoardsEdit => 'Sửa bảng';

  @override
  String get taskBoardsDelete => 'Xóa bảng';

  @override
  String get taskBoardsDeleteForever => 'Xóa vĩnh viễn';

  @override
  String get taskBoardsDuplicate => 'Nhân bản bảng';

  @override
  String get taskBoardsArchive => 'Lưu trữ bảng';

  @override
  String get taskBoardsUnarchive => 'Bỏ lưu trữ bảng';

  @override
  String get taskBoardsRestore => 'Khôi phục bảng';

  @override
  String get taskBoardsCreated => 'Đã tạo bảng.';

  @override
  String get taskBoardsUpdated => 'Đã cập nhật bảng.';

  @override
  String get taskBoardsDeleted => 'Đã chuyển bảng vào đã xóa gần đây.';

  @override
  String get taskBoardsDeletedForever => 'Đã xóa bảng vĩnh viễn.';

  @override
  String get taskBoardsDuplicated => 'Đã nhân bản bảng.';

  @override
  String get taskBoardsArchived => 'Đã lưu trữ bảng.';

  @override
  String get taskBoardsUnarchived => 'Đã bỏ lưu trữ bảng.';

  @override
  String get taskBoardsRestored => 'Đã khôi phục bảng.';

  @override
  String get taskBoardsLoadError => 'Không thể tải bảng lúc này';

  @override
  String get taskBoardsNameLabel => 'Tên bảng';

  @override
  String get taskBoardsNamePlaceholder => 'Bảng chưa đặt tên';

  @override
  String get taskBoardsNameRequired => 'Tên bảng là bắt buộc';

  @override
  String get taskBoardsIconLabel => 'Biểu tượng bảng';

  @override
  String get taskBoardsIconPlaceholder => 'Chọn biểu tượng';

  @override
  String get taskBoardsIconPickerTitle => 'Chọn biểu tượng bảng';

  @override
  String get taskBoardsIconPickerSearch => 'Tìm biểu tượng';

  @override
  String get taskBoardsIconPickerEmpty => 'Không tìm thấy biểu tượng';

  @override
  String get taskBoardsAccessDeniedTitle => 'Quyền truy cập bị hạn chế';

  @override
  String get taskBoardsAccessDeniedDescription => 'Bạn cần quyền quản lý dự án trong không gian làm việc này để quản lý bảng công việc.';

  @override
  String get taskBoardsFilterAll => 'Tất cả';

  @override
  String get taskBoardsFilterActive => 'Đang hoạt động';

  @override
  String get taskBoardsFilterArchived => 'Đã lưu trữ';

  @override
  String get taskBoardsFilterRecentlyDeleted => 'Đã xóa gần đây';

  @override
  String get taskBoardsPageSize => 'Kích thước trang';

  @override
  String taskBoardsPageSizeOption(int count) {
    return '$count mục';
  }

  @override
  String taskBoardsPageInfo(int current, int total) {
    return 'Trang $current / $total';
  }

  @override
  String taskBoardsListsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count danh sách',
      one: '$count danh sách',
    );
    return '$_temp0';
  }

  @override
  String taskBoardsTasksCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count công việc',
      one: '$count công việc',
    );
    return '$_temp0';
  }

  @override
  String get taskBoardsCreatedAt => 'Đã tạo';

  @override
  String get taskBoardsRecentlyDeleted => 'Đã xóa gần đây';

  @override
  String get taskBoardsDeleteConfirm => 'Chuyển bảng này vào mục đã xóa gần đây?';

  @override
  String get taskBoardsDeleteForeverConfirm => 'Xóa vĩnh viễn bảng này? Hành động này không thể hoàn tác.';

  @override
  String get taskBoardsEmptyTitle => 'Chưa có bảng nào';

  @override
  String get taskBoardsEmptyDescription => 'Tạo bảng đầu tiên để sắp xếp công việc.';

  @override
  String get taskBoardsEmptyArchivedTitle => 'Không có bảng đã lưu trữ';

  @override
  String get taskBoardsEmptyArchivedDescription => 'Các bảng đã lưu trữ sẽ hiển thị tại đây.';

  @override
  String get taskBoardsEmptyDeletedTitle => 'Không có bảng đã xóa gần đây';

  @override
  String get taskBoardsEmptyDeletedDescription => 'Các bảng đã xóa sẽ xuất hiện ở đây trước khi bị xóa vĩnh viễn.';

  @override
  String get taskBoardDetailLoadError => 'Không thể tải chi tiết bảng lúc này';

  @override
  String get taskBoardDetailUntitledBoard => 'Bảng chưa đặt tên';

  @override
  String get taskBoardDetailUntitledList => 'Danh sách chưa đặt tên';

  @override
  String get taskBoardDetailUntitledTask => 'Công việc chưa đặt tên';

  @override
  String get taskBoardDetailListView => 'Chế độ danh sách';

  @override
  String get taskBoardDetailKanbanView => 'Chế độ kanban';

  @override
  String get taskBoardDetailSearchPlaceholder => 'Tìm kiếm công việc';

  @override
  String get taskBoardDetailNoListsTitle => 'Chưa có danh sách';

  @override
  String get taskBoardDetailNoListsDescription => 'Tạo danh sách để bắt đầu sắp xếp công việc trong bảng này.';

  @override
  String get taskBoardDetailNoTasksInList => 'Danh sách này chưa có công việc';

  @override
  String get taskBoardDetailNoMatchingTasks => 'Không có công việc nào khớp với từ khóa tìm kiếm.';

  @override
  String get taskBoardDetailTaskActions => 'Thao tác công việc';

  @override
  String get taskBoardDetailMoveTask => 'Di chuyển công việc';

  @override
  String get taskBoardDetailTaskMoved => 'Đã di chuyển công việc.';

  @override
  String get taskBoardDetailCreateTask => 'Tạo công việc';

  @override
  String get taskBoardDetailEditTask => 'Chỉnh sửa công việc';

  @override
  String get taskBoardDetailTaskTitleLabel => 'Tiêu đề';

  @override
  String get taskBoardDetailTaskTitleHint => 'Công việc chưa đặt tên';

  @override
  String get taskBoardDetailTaskTitleRequired => 'Tiêu đề công việc là bắt buộc';

  @override
  String get taskBoardDetailTaskDescriptionLabel => 'Mô tả';

  @override
  String get taskBoardDetailTaskDescriptionHint => 'Thêm mô tả';

  @override
  String get taskBoardDetailTaskDescriptionComingSoon => 'Tính năng chỉnh sửa mô tả sẽ sớm có trên mobile.';

  @override
  String get taskBoardDetailTaskListLabel => 'Danh sách';

  @override
  String get taskBoardDetailTaskListSelect => 'Chọn danh sách';

  @override
  String get taskBoardDetailPriority => 'Độ ưu tiên';

  @override
  String get taskBoardDetailTaskDates => 'Ngày';

  @override
  String get taskBoardDetailTaskStartDate => 'Ngày bắt đầu';

  @override
  String get taskBoardDetailTaskEndDate => 'Ngày kết thúc';

  @override
  String get taskBoardDetailTaskEstimation => 'Ước lượng';

  @override
  String get taskBoardDetailTaskEstimationNone => 'Chưa ước lượng';

  @override
  String get taskBoardDetailTaskAssignees => 'Người được giao';

  @override
  String get taskBoardDetailTaskLabels => 'Nhãn';

  @override
  String get taskBoardDetailTaskProjects => 'Dự án';

  @override
  String get taskBoardDetailTaskSelectAssignees => 'Chọn người được giao';

  @override
  String get taskBoardDetailTaskSelectLabels => 'Chọn nhãn';

  @override
  String get taskBoardDetailTaskSelectProjects => 'Chọn dự án';

  @override
  String get taskBoardDetailEditorDetailsTab => 'Chi tiết';

  @override
  String get taskBoardDetailEditorRelationshipsTab => 'Quan hệ';

  @override
  String get taskBoardDetailParentTask => 'Công việc cha';

  @override
  String get taskBoardDetailChildTasks => 'Công việc con';

  @override
  String get taskBoardDetailBlockedBy => 'Bị chặn bởi';

  @override
  String get taskBoardDetailBlocking => 'Đang chặn';

  @override
  String get taskBoardDetailRelatedTasks => 'Công việc liên quan';

  @override
  String get taskBoardDetailAddParentTask => 'Thêm công việc cha';

  @override
  String get taskBoardDetailAddChildTask => 'Thêm công việc con';

  @override
  String get taskBoardDetailAddBlockedByTask => 'Thêm công việc chặn';

  @override
  String get taskBoardDetailAddBlockingTask => 'Thêm công việc bị chặn';

  @override
  String get taskBoardDetailAddRelatedTask => 'Thêm công việc liên quan';

  @override
  String get taskBoardDetailOpenRelatedTask => 'Mở công việc liên quan';

  @override
  String get taskBoardDetailRemoveRelationship => 'Xóa quan hệ';

  @override
  String get taskBoardDetailUnableToOpenLinkedTask => 'Không thể mở công việc liên kết từ đây.';

  @override
  String get taskBoardDetailSelectTask => 'Chọn công việc';

  @override
  String get taskBoardDetailSearchTasks => 'Tìm kiếm công việc';

  @override
  String get taskBoardDetailNoAvailableRelationshipTasks => 'Không có công việc khả dụng cho quan hệ này.';

  @override
  String get taskBoardDetailRelationshipAdded => 'Đã thêm quan hệ.';

  @override
  String get taskBoardDetailRelationshipRemoved => 'Đã xóa quan hệ.';

  @override
  String get taskBoardDetailNone => 'Không có';

  @override
  String get taskBoardDetailNoDate => 'Chưa đặt ngày';

  @override
  String taskBoardDetailDueAt(String date) {
    return 'Hạn $date';
  }

  @override
  String taskBoardDetailStartsAt(String date) {
    return 'Bắt đầu $date';
  }

  @override
  String get taskBoardDetailOverdue => 'Quá hạn';

  @override
  String get taskBoardDetailToday => 'hôm nay';

  @override
  String get taskBoardDetailTomorrow => 'ngày mai';

  @override
  String get taskBoardDetailYesterday => 'hôm qua';

  @override
  String taskBoardDetailInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'trong $count ngày',
      one: 'trong $count ngày',
    );
    return '$_temp0';
  }

  @override
  String taskBoardDetailDaysAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ngày trước',
      one: '$count ngày trước',
    );
    return '$_temp0';
  }

  @override
  String get taskBoardDetailInvalidDateRange => 'Ngày kết thúc phải cùng hoặc sau ngày bắt đầu';

  @override
  String get taskBoardDetailTaskSaved => 'Đã cập nhật công việc.';

  @override
  String get taskBoardDetailTaskCreated => 'Đã tạo công việc.';

  @override
  String get taskBoardDetailNoMoveTargets => 'Không có danh sách khác để di chuyển công việc này.';

  @override
  String get taskBoardDetailBoardActions => 'Thao tác bảng';

  @override
  String get taskBoardDetailRefresh => 'Làm mới bảng';

  @override
  String get taskBoardDetailRenameBoard => 'Đổi tên bảng';

  @override
  String get taskBoardDetailBoardRenamed => 'Đã đổi tên bảng.';

  @override
  String get taskBoardDetailCreateList => 'Tạo danh sách';

  @override
  String get taskBoardDetailEditList => 'Chỉnh sửa danh sách';

  @override
  String get taskBoardDetailRenameList => 'Đổi tên danh sách';

  @override
  String get taskBoardDetailListActions => 'Thao tác danh sách';

  @override
  String get taskBoardDetailListCreated => 'Đã tạo danh sách.';

  @override
  String get taskBoardDetailListRenamed => 'Đã đổi tên danh sách.';

  @override
  String get taskBoardDetailListUpdated => 'Đã cập nhật danh sách.';

  @override
  String get taskBoardDetailNameRequired => 'Tên là bắt buộc';

  @override
  String get taskBoardDetailListNameLabel => 'Tên danh sách';

  @override
  String get taskBoardDetailStatusCategoryLabel => 'Nhóm trạng thái';

  @override
  String get taskBoardDetailColorLabel => 'Màu sắc';

  @override
  String get taskBoardDetailFilters => 'Bộ lọc';

  @override
  String get taskBoardDetailFiltersActive => 'Bộ lọc đang bật';

  @override
  String get taskBoardDetailFilterLists => 'Danh sách';

  @override
  String get taskBoardDetailFilterStatuses => 'Trạng thái';

  @override
  String get taskBoardDetailFilterAssignees => 'Người được giao';

  @override
  String get taskBoardDetailFilterLabels => 'Nhãn';

  @override
  String get taskBoardDetailFilterProjects => 'Dự án';

  @override
  String get taskBoardDetailNoFilterOptions => 'Không có tùy chọn';

  @override
  String get taskBoardDetailStatusNotStarted => 'Chưa bắt đầu';

  @override
  String get taskBoardDetailStatusActive => 'Đang thực hiện';

  @override
  String get taskBoardDetailStatusDone => 'Hoàn thành';

  @override
  String get taskBoardDetailStatusClosed => 'Đã đóng';

  @override
  String get taskBoardDetailStatusDocuments => 'Tài liệu';

  @override
  String get taskBoardDetailColorGray => 'Xám';

  @override
  String get taskBoardDetailColorRed => 'Đỏ';

  @override
  String get taskBoardDetailColorBlue => 'Xanh dương';

  @override
  String get taskBoardDetailColorGreen => 'Xanh lá';

  @override
  String get taskBoardDetailColorYellow => 'Vàng';

  @override
  String get taskBoardDetailColorOrange => 'Cam';

  @override
  String get taskBoardDetailColorPurple => 'Tím';

  @override
  String get taskBoardDetailColorPink => 'Hồng';

  @override
  String get taskBoardDetailColorIndigo => 'Chàm';

  @override
  String get taskBoardDetailColorCyan => 'Lục lam';

  @override
  String get taskBoardDetailClearFilters => 'Xóa bộ lọc';

  @override
  String get taskBoardDetailApplyFilters => 'Áp dụng bộ lọc';

  @override
  String get taskPlanningTitle => 'Lập kế hoạch';

  @override
  String get taskEstimatesTitle => 'Ước lượng';

  @override
  String get taskLabelsTab => 'Nhãn';

  @override
  String get taskLabelsCreate => 'Tạo nhãn';

  @override
  String get taskLabelsEdit => 'Sửa nhãn';

  @override
  String get taskLabelsDelete => 'Xóa nhãn';

  @override
  String get taskLabelsDeleteConfirm => 'Xóa nhãn này?';

  @override
  String get taskLabelsCreated => 'Đã tạo nhãn.';

  @override
  String get taskLabelsUpdated => 'Đã cập nhật nhãn.';

  @override
  String get taskLabelsDeleted => 'Đã xóa nhãn.';

  @override
  String get taskLabelsName => 'Tên nhãn';

  @override
  String get taskLabelsNameRequired => 'Tên nhãn là bắt buộc';

  @override
  String get taskLabelsColorInvalid => 'Chọn một trong các màu cài sẵn được hỗ trợ';

  @override
  String get taskLabelsEmptyTitle => 'Chưa có nhãn';

  @override
  String get taskLabelsEmptyDescription => 'Tạo nhãn để gắn thẻ và sắp xếp công việc.';

  @override
  String get taskEstimatesDescription => 'Cấu hình phương pháp ước lượng cho các bảng công việc và xem mức độ áp dụng hiện tại.';

  @override
  String get taskEstimatesAccessDeniedTitle => 'Quyền truy cập bị hạn chế';

  @override
  String get taskEstimatesAccessDeniedDescription => 'Bạn cần quyền quản lý dự án trong không gian làm việc này để thay đổi cài đặt ước lượng của bảng công việc.';

  @override
  String get taskEstimatesTotalBoards => 'Tổng số bảng';

  @override
  String get taskEstimatesConfiguredBoards => 'Đã cấu hình';

  @override
  String get taskEstimatesExtendedRangeBoards => 'Phạm vi mở rộng';

  @override
  String get taskEstimatesDistributionTitle => 'Phương pháp ước lượng';

  @override
  String get taskEstimatesBoardConfigTitle => 'Cấu hình ước lượng của bảng';

  @override
  String get taskEstimatesNoBoardsTitle => 'Không tìm thấy bảng nào';

  @override
  String get taskEstimatesNoBoardsDescription => 'Hãy tạo bảng công việc trước, sau đó quay lại đây để cấu hình phương pháp ước lượng.';

  @override
  String get taskEstimatesExtendedBadge => 'Mở rộng';

  @override
  String taskEstimatesDialogTitle(String boardName) {
    return 'Chỉnh sửa $boardName';
  }

  @override
  String get taskEstimatesDialogEstimationMethod => 'Phương pháp ước lượng';

  @override
  String taskEstimatesDialogRangeTitle(String label) {
    return 'Phạm vi $label';
  }

  @override
  String get taskEstimatesDialogEstimationOptions => 'Tùy chọn ước lượng';

  @override
  String get taskEstimatesDialogSelectedConfiguration => 'Cấu hình đã chọn';

  @override
  String get taskEstimatesDialogSave => 'Cập nhật ước lượng';

  @override
  String get taskEstimatesRangeStandard => 'Phạm vi tiêu chuẩn';

  @override
  String get taskEstimatesRangeExtended => 'Phạm vi mở rộng';

  @override
  String get taskEstimatesUnnamedBoard => 'Bảng chưa đặt tên';

  @override
  String get taskEstimatesAllowZeroEstimates => 'Cho phép ước lượng bằng 0';

  @override
  String get taskEstimatesAllowZeroEstimatesDescription => 'Khi bật, các công việc có thể được ước lượng bằng giá trị 0 và sẽ đóng góp 0 vào tổng ước lượng.';

  @override
  String get taskEstimatesCountUnestimatedIssues => 'Đếm các công việc chưa ước lượng';

  @override
  String get taskEstimatesCountUnestimatedIssuesDescription => 'Khi bật, các công việc chưa ước lượng sẽ được tính là 1 đơn vị vào tổng ước lượng. Khi tắt, chúng sẽ được tính là 0.';

  @override
  String get taskEstimatesUpdateSuccess => 'Đã cập nhật ước lượng thành công.';

  @override
  String get taskEstimatesTypeNoneLabel => 'Không có';

  @override
  String get taskEstimatesTypeNoneDescription => 'Không có phương pháp ước lượng nào được cấu hình cho bảng này.';

  @override
  String get taskEstimatesTypeFibonacciLabel => 'Fibonacci';

  @override
  String get taskEstimatesTypeFibonacciStandardZeroEnabled => 'Dãy Fibonacci: 0, 1, 2, 3, 5, 8.';

  @override
  String get taskEstimatesTypeFibonacciStandardZeroDisabled => 'Dãy Fibonacci: 1, 2, 3, 5, 8.';

  @override
  String get taskEstimatesTypeFibonacciExtendedZeroEnabled => 'Dãy Fibonacci mở rộng: 0, 1, 2, 3, 5, 8, 13, 21.';

  @override
  String get taskEstimatesTypeFibonacciExtendedZeroDisabled => 'Dãy Fibonacci mở rộng: 1, 2, 3, 5, 8, 13, 21.';

  @override
  String get taskEstimatesTypeLinearLabel => 'Tuyến tính';

  @override
  String get taskEstimatesTypeLinearStandardZeroEnabled => 'Dãy tuyến tính: 0, 1, 2, 3, 4, 5.';

  @override
  String get taskEstimatesTypeLinearStandardZeroDisabled => 'Dãy tuyến tính: 1, 2, 3, 4, 5.';

  @override
  String get taskEstimatesTypeLinearExtendedZeroEnabled => 'Dãy tuyến tính mở rộng: 0, 1, 2, 3, 4, 5, 6, 7.';

  @override
  String get taskEstimatesTypeLinearExtendedZeroDisabled => 'Dãy tuyến tính mở rộng: 1, 2, 3, 4, 5, 6, 7.';

  @override
  String get taskEstimatesTypeExponentialLabel => 'Lũy thừa';

  @override
  String get taskEstimatesTypeExponentialStandardZeroEnabled => 'Dãy lũy thừa: 0, 1, 2, 4, 8, 16.';

  @override
  String get taskEstimatesTypeExponentialStandardZeroDisabled => 'Dãy lũy thừa: 1, 2, 4, 8, 16.';

  @override
  String get taskEstimatesTypeExponentialExtendedZeroEnabled => 'Dãy lũy thừa mở rộng: 0, 1, 2, 4, 8, 16, 32, 64.';

  @override
  String get taskEstimatesTypeExponentialExtendedZeroDisabled => 'Dãy lũy thừa mở rộng: 1, 2, 4, 8, 16, 32, 64.';

  @override
  String get taskEstimatesTypeTshirtLabel => 'Áo thun';

  @override
  String get taskEstimatesTypeTshirtStandard => 'Kích cỡ áo: -, XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtExtended => 'Kích cỡ áo mở rộng: -, XS, S, M, L, XL, XXL, XXXL.';

  @override
  String get taskPortfolioTitle => 'Danh mục';

  @override
  String get taskPortfolioProjectsTab => 'Dự án';

  @override
  String get taskPortfolioInitiativesTab => 'Sáng kiến';

  @override
  String get taskPortfolioAccessDeniedTitle => 'Quyền truy cập bị hạn chế';

  @override
  String get taskPortfolioAccessDeniedDescription => 'Bạn cần quyền quản lý dự án trong không gian làm việc này để quản lý dự án và sáng kiến.';

  @override
  String get taskPortfolioProjectsEmptyTitle => 'Chưa có dự án';

  @override
  String get taskPortfolioProjectsEmptyDescription => 'Tạo dự án đầu tiên để tổ chức công việc vượt ra ngoài từng tác vụ riêng lẻ.';

  @override
  String get taskPortfolioInitiativesEmptyTitle => 'Chưa có sáng kiến';

  @override
  String get taskPortfolioInitiativesEmptyDescription => 'Tạo một sáng kiến để nhóm các dự án liên quan dưới cùng một kết quả chung.';

  @override
  String get taskPortfolioNoDescription => 'Chưa có mô tả';

  @override
  String get taskPortfolioProjectTasksLinked => 'tác vụ liên kết';

  @override
  String get taskPortfolioProjectCompletedTasks => 'đã hoàn thành';

  @override
  String get taskPortfolioInitiativeProjectsLinked => 'dự án liên kết';

  @override
  String get taskPortfolioCreateProject => 'Tạo dự án';

  @override
  String get taskPortfolioEditProject => 'Sửa dự án';

  @override
  String get taskPortfolioDeleteProject => 'Xóa dự án';

  @override
  String get taskPortfolioDeleteProjectConfirm => 'Xóa dự án này?';

  @override
  String get taskPortfolioProjectCreated => 'Đã tạo dự án.';

  @override
  String get taskPortfolioProjectUpdated => 'Đã cập nhật dự án.';

  @override
  String get taskPortfolioProjectDeleted => 'Đã xóa dự án.';

  @override
  String get taskPortfolioProjectName => 'Tên dự án';

  @override
  String get taskPortfolioProjectNameRequired => 'Tên dự án là bắt buộc';

  @override
  String get taskPortfolioProjectDescriptionHint => 'Mô tả mục tiêu của dự án';

  @override
  String get taskPortfolioProjectStatus => 'Trạng thái dự án';

  @override
  String get taskPortfolioProjectPriority => 'Mức ưu tiên';

  @override
  String get taskPortfolioProjectHealth => 'Tình trạng tiến độ';

  @override
  String get taskPortfolioProjectLead => 'Người phụ trách';

  @override
  String get taskPortfolioProjectNoHealth => 'Chưa có tình trạng';

  @override
  String get taskPortfolioProjectNoLead => 'Chưa có người phụ trách';

  @override
  String get taskPortfolioProjectStartDate => 'Ngày bắt đầu';

  @override
  String get taskPortfolioProjectEndDate => 'Ngày kết thúc';

  @override
  String get taskPortfolioProjectArchived => 'Đã lưu trữ';

  @override
  String get taskPortfolioProjectArchivedHint => 'Ẩn dự án này khỏi các chế độ xem lập kế hoạch đang hoạt động.';

  @override
  String get taskPortfolioPickDate => 'Chọn ngày';

  @override
  String get taskPortfolioClearSelection => 'Xóa';

  @override
  String get taskPortfolioProjectStatusActive => 'Đang hoạt động';

  @override
  String get taskPortfolioProjectStatusBacklog => 'Tồn đọng';

  @override
  String get taskPortfolioProjectStatusPlanned => 'Đã lên kế hoạch';

  @override
  String get taskPortfolioProjectStatusInProgress => 'Đang thực hiện';

  @override
  String get taskPortfolioProjectStatusInReview => 'Đang rà soát';

  @override
  String get taskPortfolioProjectStatusInTesting => 'Đang kiểm thử';

  @override
  String get taskPortfolioProjectStatusCompleted => 'Hoàn thành';

  @override
  String get taskPortfolioProjectStatusCancelled => 'Đã hủy';

  @override
  String get taskPortfolioProjectStatusOnHold => 'Tạm dừng';

  @override
  String get taskPortfolioProjectPriorityCritical => 'Nghiêm trọng';

  @override
  String get taskPortfolioProjectPriorityHigh => 'Cao';

  @override
  String get taskPortfolioProjectPriorityNormal => 'Bình thường';

  @override
  String get taskPortfolioProjectPriorityLow => 'Thấp';

  @override
  String get taskPortfolioCreateInitiative => 'Tạo sáng kiến';

  @override
  String get taskPortfolioEditInitiative => 'Sửa sáng kiến';

  @override
  String get taskPortfolioDeleteInitiative => 'Xóa sáng kiến';

  @override
  String get taskPortfolioDeleteInitiativeConfirm => 'Xóa sáng kiến này?';

  @override
  String get taskPortfolioInitiativeCreated => 'Đã tạo sáng kiến.';

  @override
  String get taskPortfolioInitiativeUpdated => 'Đã cập nhật sáng kiến.';

  @override
  String get taskPortfolioInitiativeDeleted => 'Đã xóa sáng kiến.';

  @override
  String get taskPortfolioInitiativeName => 'Tên sáng kiến';

  @override
  String get taskPortfolioInitiativeNameRequired => 'Tên sáng kiến là bắt buộc';

  @override
  String get taskPortfolioInitiativeDescriptionHint => 'Mô tả kết quả của sáng kiến';

  @override
  String get taskPortfolioInitiativeStatus => 'Trạng thái sáng kiến';

  @override
  String get taskPortfolioInitiativeStatusActive => 'Đang hoạt động';

  @override
  String get taskPortfolioInitiativeStatusCompleted => 'Hoàn thành';

  @override
  String get taskPortfolioInitiativeStatusOnHold => 'Tạm dừng';

  @override
  String get taskPortfolioInitiativeStatusCancelled => 'Đã hủy';

  @override
  String get taskPortfolioManageProjects => 'Quản lý dự án';

  @override
  String get taskPortfolioLinkedProjects => 'Dự án đã liên kết';

  @override
  String get taskPortfolioNoLinkedProjects => 'Chưa có dự án nào được liên kết';

  @override
  String get taskPortfolioProjectHealthOnTrack => 'Đúng tiến độ';

  @override
  String get taskPortfolioProjectHealthAtRisk => 'Có rủi ro';

  @override
  String get taskPortfolioProjectHealthOffTrack => 'Chệch tiến độ';

  @override
  String taskPortfolioProjectTasksProgress(int completed, int total) {
    return '$completed/$total nhiệm vụ';
  }

  @override
  String get taskPortfolioLinkProject => 'Liên kết dự án';

  @override
  String get taskPortfolioNoAvailableProjects => 'Chọn dự án';

  @override
  String get taskPortfolioAllProjectsLinked => 'Tất cả dự án trong không gian làm việc đã được liên kết.';

  @override
  String get taskPortfolioProjectLinked => 'Đã liên kết dự án.';

  @override
  String get taskPortfolioProjectUnlinked => 'Đã gỡ liên kết dự án.';

  @override
  String get taskPortfolioProjectDetailsTitle => 'Chi tiết dự án';

  @override
  String get taskPortfolioProjectNotFoundTitle => 'Không tìm thấy dự án';

  @override
  String get taskPortfolioProjectNotFoundDescription => 'Dự án này không còn khả dụng trong không gian làm việc hiện tại.';

  @override
  String get taskPortfolioProjectTimeline => 'Mốc thời gian';

  @override
  String get taskPortfolioProjectTasks => 'Nhiệm vụ';

  @override
  String get taskPortfolioLinkedTasks => 'Nhiệm vụ liên kết';

  @override
  String get taskPortfolioUnlinkTask => 'Gỡ liên kết nhiệm vụ';

  @override
  String get taskPortfolioProjectStats => 'Thống kê dự án';

  @override
  String get taskPortfolioNoLinkedTasks => 'Chưa có nhiệm vụ nào được liên kết';

  @override
  String get taskPortfolioLinkTask => 'Liên kết nhiệm vụ';

  @override
  String get taskPortfolioSearchTasksHint => 'Tìm kiếm nhiệm vụ';

  @override
  String get taskPortfolioNoMatchingTasks => 'Không có nhiệm vụ nào khớp với từ khóa tìm kiếm.';

  @override
  String get taskPortfolioSelectTask => 'Chọn nhiệm vụ';

  @override
  String get taskPortfolioSelectTaskHint => 'Chọn một nhiệm vụ';

  @override
  String get taskPortfolioNoAvailableTasks => 'Tất cả nhiệm vụ khả dụng đã được liên kết với dự án này.';

  @override
  String get taskPortfolioProjectCompletion => 'Tiến độ hoàn thành';

  @override
  String get taskPortfolioTaskLinked => 'Đã liên kết nhiệm vụ.';

  @override
  String get taskPortfolioTaskUnlinked => 'Đã gỡ liên kết nhiệm vụ.';

  @override
  String get taskPortfolioProjectUpdates => 'Cập nhật dự án';

  @override
  String get taskPortfolioUpdatePlaceholder => 'Chia sẻ tiến độ mới nhất, trở ngại hoặc kết quả nổi bật...';

  @override
  String get taskPortfolioPostUpdate => 'Đăng cập nhật';

  @override
  String get taskPortfolioPostingUpdate => 'Đang đăng...';

  @override
  String get taskPortfolioNoProjectUpdates => 'Chưa có cập nhật nào';

  @override
  String get taskPortfolioUnknownUser => 'Người dùng không xác định';

  @override
  String get taskPortfolioUpdateEdited => 'Đã chỉnh sửa';

  @override
  String get taskPortfolioEditUpdate => 'Sửa cập nhật';

  @override
  String get taskPortfolioDeleteUpdate => 'Xóa cập nhật';

  @override
  String get taskPortfolioDeleteUpdateConfirm => 'Xóa cập nhật này?';

  @override
  String get taskPortfolioUpdateCannotBeEmpty => 'Nội dung cập nhật không được để trống';

  @override
  String get taskPortfolioUpdatePosted => 'Đã đăng cập nhật.';

  @override
  String get taskPortfolioUpdateSaved => 'Đã lưu cập nhật.';

  @override
  String get taskPortfolioUpdateDeleted => 'Đã xóa cập nhật.';

  @override
  String get taskEstimatesTypeTshirtStandardZeroEnabled => 'Kích cỡ áo: -, XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtStandardZeroDisabled => 'Kích cỡ áo: XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtExtendedZeroEnabled => 'Kích cỡ áo mở rộng: -, XS, S, M, L, XL, XXL, XXXL.';

  @override
  String get taskEstimatesTypeTshirtExtendedZeroDisabled => 'Kích cỡ áo mở rộng: XS, S, M, L, XL, XXL, XXXL.';

  @override
  String get calendarTitle => 'Lịch';

  @override
  String get calendarEmpty => 'Không có sự kiện';

  @override
  String get calendarToday => 'Hôm nay';

  @override
  String get calendarDayView => 'Ngày';

  @override
  String get calendarWeekView => 'Tuần';

  @override
  String get calendarMonthView => 'Tháng';

  @override
  String get calendarAllDay => 'Cả ngày';

  @override
  String get calendarNoEvents => 'Không có sự kiện cho ngày này';

  @override
  String get calendarNewEvent => 'Sự kiện mới';

  @override
  String get calendarEditEvent => 'Sửa sự kiện';

  @override
  String get calendarDeleteEvent => 'Xóa sự kiện';

  @override
  String get calendarDeleteConfirm => 'Xóa sự kiện này?';

  @override
  String get calendarEventTitle => 'Tiêu đề';

  @override
  String get calendarEventTitleHint => 'Thêm tiêu đề';

  @override
  String get calendarEventDescription => 'Mô tả';

  @override
  String get calendarEventDescriptionHint => 'Thêm mô tả';

  @override
  String get calendarEventStartDate => 'Ngày bắt đầu';

  @override
  String get calendarEventEndDate => 'Ngày kết thúc';

  @override
  String get calendarEventStartTime => 'Giờ bắt đầu';

  @override
  String get calendarEventEndTime => 'Giờ kết thúc';

  @override
  String get calendarEventAllDay => 'Cả ngày';

  @override
  String get calendarEventColor => 'Màu sắc';

  @override
  String get calendarEventSave => 'Lưu';

  @override
  String get calendarEventCreate => 'Tạo sự kiện';

  @override
  String get calendarEventUpdate => 'Cập nhật sự kiện';

  @override
  String get calendarEventDeleted => 'Đã xóa sự kiện';

  @override
  String get calendarEventCreated => 'Đã tạo sự kiện';

  @override
  String get calendarEventUpdated => 'Đã cập nhật sự kiện';

  @override
  String get calendarEventCancel => 'Hủy';

  @override
  String get calendarEventDelete => 'Xóa';

  @override
  String get calendarThreeDayView => '3 Ngày';

  @override
  String get calendarAgendaView => 'Lịch trình';

  @override
  String get calendarAgendaEmpty => 'Không có sự kiện sắp tới';

  @override
  String calendarAllDayProgress(int current, int total) {
    return 'Ngày $current / $total';
  }

  @override
  String get calendarConnectionsTitle => 'Quản lý tài khoản lịch';

  @override
  String get calendarConnectionsSubtitle => 'Kết nối tài khoản Google và Microsoft để đồng bộ lịch.';

  @override
  String get calendarConnectionsAccounts => 'Tài khoản đã kết nối';

  @override
  String get calendarConnectionsAddAccount => 'Thêm tài khoản';

  @override
  String get calendarConnectionsEmpty => 'Chưa có tài khoản nào được kết nối';

  @override
  String get calendarConnectionsDisconnect => 'Ngắt kết nối';

  @override
  String calendarConnectionsDisconnectConfirm(String account) {
    return 'Ngắt kết nối $account? Các lịch liên quan sẽ bị vô hiệu hóa.';
  }

  @override
  String get financeTitle => 'Tài chính';

  @override
  String get financeOverviewLabel => 'Tổng quan';

  @override
  String get financeActivityLabel => 'Hoạt động';

  @override
  String get financeManageLabel => 'Quản lý';

  @override
  String get financeOverviewEyebrow => 'Tóm tắt không gian làm việc';

  @override
  String financeOverviewCrossCurrencyHint(String currency) {
    return 'Bao gồm số dư đã quy đổi giữa các ví. Tiền tệ gốc: $currency.';
  }

  @override
  String financeOverviewSingleCurrencyHint(String currency) {
    return 'Mọi số dư đều đang được theo dõi bằng $currency.';
  }

  @override
  String get financeWallets => 'Ví';

  @override
  String get financeTransactions => 'Giao dịch';

  @override
  String get financeCategories => 'Danh mục';

  @override
  String get financeRecentTransactions => 'Giao dịch gần đây';

  @override
  String get financeOverviewActionsSubtitle => 'Đi thẳng vào thao tác bạn cần làm tiếp theo.';

  @override
  String get financeOverviewCreateTransactionHint => 'Ghi nhanh thu, chi hoặc chuyển khoản.';

  @override
  String get financeOverviewWalletsHint => 'Xem số dư và tinh chỉnh từng ví.';

  @override
  String get financeOverviewManageHint => 'Quản lý danh mục, thẻ và cấu trúc tài chính.';

  @override
  String get financeOverviewWalletSectionTitle => 'Danh sách ví';

  @override
  String get financeOverviewWalletSectionSubtitle => 'Nhìn nhanh các số dư quan trọng nhất của bạn.';

  @override
  String get financeOverviewNoWalletsBody => 'Tạo ví đầu tiên để bắt đầu theo dõi số dư, chuyển khoản và danh mục.';

  @override
  String get financeOverviewActivityTitle => 'Hoạt động gần đây';

  @override
  String get financeOverviewActivitySubtitle => 'Biến động mới nhất trên tất cả ví của bạn.';

  @override
  String get financeOverviewNoTransactionsBody => 'Các giao dịch sẽ xuất hiện ở đây khi bạn bắt đầu ghi nhận dòng tiền vào ra.';

  @override
  String get financeNoWallets => 'Chưa có ví';

  @override
  String get financeCreateWallet => 'Tạo ví';

  @override
  String get financeEditWallet => 'Sửa ví';

  @override
  String get financeDeleteWallet => 'Xóa ví';

  @override
  String get financeDeleteWalletConfirm => 'Xóa ví này?';

  @override
  String get financeWalletName => 'Tên ví';

  @override
  String get financeWalletNameRequired => 'Vui lòng nhập tên ví';

  @override
  String get financeWalletDescriptionTooLong => 'Mô tả tối đa 500 ký tự';

  @override
  String get financeWalletTypeStandard => 'Thường';

  @override
  String get financeWalletTypeCredit => 'Tín dụng';

  @override
  String get financeWalletMetadata => 'Thông tin ví';

  @override
  String get financeWalletBalance => 'Số dư';

  @override
  String get financeWalletCurrency => 'Tiền tệ';

  @override
  String get financeWalletSelectCurrency => 'Chọn tiền tệ';

  @override
  String get financeWalletSearchCurrency => 'Tìm tiền tệ';

  @override
  String get financeCurrencyPickerSubtitle => 'Chọn mã tiền tệ phù hợp nhất với cách ví này được theo dõi.';

  @override
  String get financeWalletCurrencyRequired => 'Nhập mã tiền tệ 3 ký tự hợp lệ';

  @override
  String get financeWalletIconOrImage => 'Biểu tượng hoặc hình ảnh';

  @override
  String get financeWalletNoVisual => 'Chưa chọn hình đại diện';

  @override
  String get financeWalletPickImage => 'Chọn hình ảnh';

  @override
  String get financeWalletClearVisual => 'Xóa hình đại diện';

  @override
  String get financeWalletDialogSubtitle => 'Thiết lập cách ví này hiển thị và hoạt động trong phần tài chính.';

  @override
  String get financeWalletCreditDetails => 'Thông tin tín dụng';

  @override
  String get financeWalletCreditLimit => 'Hạn mức tín dụng';

  @override
  String get financeWalletCreditLimitRequired => 'Hạn mức tín dụng phải lớn hơn 0';

  @override
  String get financeWalletStatementDate => 'Ngày sao kê';

  @override
  String get financeWalletPaymentDate => 'Ngày thanh toán';

  @override
  String get financeWalletDateRequired => 'Nhập ngày từ 1 đến 31';

  @override
  String get financeWalletBankTab => 'Ngân hàng';

  @override
  String get financeWalletMobileTab => 'Ví điện tử';

  @override
  String get financeWalletSearchImage => 'Tìm hình ảnh';

  @override
  String financeWalletImageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count hình khả dụng',
      one: '1 hình khả dụng',
      zero: 'Không có hình ảnh',
    );
    return '$_temp0';
  }

  @override
  String get financeWalletClearImage => 'Xóa hình ảnh';

  @override
  String get financeNoTransactions => 'Chưa có giao dịch';

  @override
  String get financeNoCategories => 'Chưa có danh mục';

  @override
  String get financeTags => 'Thẻ';

  @override
  String get financeNoTags => 'Chưa có thẻ';

  @override
  String get financeManageCategoriesTitle => 'Danh mục';

  @override
  String get financeManageCategoriesSubtitle => 'Nhóm giao dịch vào các nhóm thu và chi rõ ràng.';

  @override
  String get financeManageTagsTitle => 'Thẻ';

  @override
  String get financeManageTagsSubtitle => 'Dùng thẻ cho các nhãn linh hoạt và báo cáo nhanh.';

  @override
  String get financeManageCategoriesEmptyBody => 'Tạo danh mục cho các mẫu thu nhập và chi tiêu lặp lại.';

  @override
  String get financeManageTagsEmptyBody => 'Tạo thẻ cho nhãn linh hoạt như chuyến đi, đăng ký hoặc dự án.';

  @override
  String get financeCreateTag => 'Tạo thẻ';

  @override
  String get financeEditTag => 'Sửa thẻ';

  @override
  String get financeDeleteTag => 'Xóa thẻ';

  @override
  String get financeDeleteTagConfirm => 'Xóa thẻ này?';

  @override
  String get financeTagName => 'Tên thẻ';

  @override
  String get financeTagNameRequired => 'Vui lòng nhập tên thẻ';

  @override
  String get financeTagDialogSubtitle => 'Đặt tên nhãn và chọn màu để dễ nhận biết.';

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
  String get financeActivityDefaultHint => 'Tìm kiếm và rà soát dòng tiền theo từng ngày.';

  @override
  String get financeActivitySearchHint => 'Tìm kiếm đang mở. Lọc theo nơi chi tiêu, ví hoặc danh mục.';

  @override
  String get financeActivitySearchEmptyBody => 'Hãy thử từ khóa khác, tên ví hoặc tên danh mục khác.';

  @override
  String get financeActivityClearSearch => 'Xóa tìm kiếm';

  @override
  String financeActivitySearchResults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Khớp $count giao dịch',
      one: 'Khớp 1 giao dịch',
      zero: 'Chưa có kết quả',
    );
    return '$_temp0';
  }

  @override
  String get financeTransactionDetails => 'Chi tiết giao dịch';

  @override
  String get financeCreateTransaction => 'Tạo giao dịch';

  @override
  String get financeEditTransaction => 'Sửa giao dịch';

  @override
  String get financeTransactionDialogSubtitle => 'Ghi lại số tiền, nguồn và thiết lập hiển thị trong một nơi.';

  @override
  String get financeDeleteTransaction => 'Xóa giao dịch';

  @override
  String get financeDeleteTransactionConfirm => 'Xóa giao dịch này?';

  @override
  String get financeTransactionCreated => 'Đã tạo giao dịch';

  @override
  String get financeTransactionUpdated => 'Đã cập nhật giao dịch';

  @override
  String get financeTransactionDeleted => 'Đã xóa giao dịch';

  @override
  String get financeAmount => 'Số tiền';

  @override
  String get financeDescription => 'Mô tả';

  @override
  String get financeTakenAt => 'Thời gian ghi nhận';

  @override
  String get financeCategory => 'Danh mục';

  @override
  String get financeWallet => 'Ví';

  @override
  String get financePickerWalletSubtitle => 'Chọn ví mà giao dịch này sẽ tác động.';

  @override
  String get financePickerCategorySubtitle => 'Chọn nhóm phù hợp nhất cho giao dịch này.';

  @override
  String get financePickerTagSubtitle => 'Chọn nhãn tùy chọn để thêm ngữ cảnh.';

  @override
  String get financeNoTag => 'Không gắn thẻ';

  @override
  String get financeDestinationWallet => 'Ví đích';

  @override
  String get financeSelectDestinationWallet => 'Chọn ví đích';

  @override
  String get financeTransferMode => 'Chế độ chuyển khoản';

  @override
  String get financeDestinationAmountOptional => 'Số tiền đích';

  @override
  String get financeSelectWalletAndCategoryFirst => 'Hãy chọn ví và danh mục trước';

  @override
  String get financeSelectWalletAndDestinationFirst => 'Hãy chọn ví nguồn và ví đích trước';

  @override
  String get financeWalletsMustBeDifferent => 'Ví nguồn và ví đích phải khác nhau';

  @override
  String get financeInvalidAmount => 'Vui lòng nhập số tiền hợp lệ';

  @override
  String get financeInvalidDestinationAmount => 'Vui lòng nhập số tiền đích hợp lệ';

  @override
  String get financeReportOptIn => 'Bao gồm trong báo cáo';

  @override
  String get financeConfidentialAmount => 'Ẩn số tiền';

  @override
  String get financeConfidentialDescription => 'Ẩn mô tả';

  @override
  String get financeConfidentialCategory => 'Ẩn danh mục';

  @override
  String get financeStatisticsSummary => 'Tổng quan thống kê';

  @override
  String get financeTotalTransactions => 'Tổng giao dịch';

  @override
  String get financeWalletNotFound => 'Không tìm thấy ví';

  @override
  String get financeCreateCategory => 'Tạo danh mục';

  @override
  String get financeEditCategory => 'Sửa danh mục';

  @override
  String get financeDeleteCategory => 'Xóa danh mục';

  @override
  String get financeDeleteCategoryConfirm => 'Xóa danh mục này?';

  @override
  String get financeCategoryNameRequired => 'Vui lòng nhập tên danh mục';

  @override
  String get financeCategoryDialogSubtitle => 'Xác định cách danh mục này hiển thị và nó là thu hay chi.';

  @override
  String get financeType => 'Loại';

  @override
  String get financeIcon => 'Biểu tượng';

  @override
  String get financeSelectIcon => 'Chọn biểu tượng';

  @override
  String get financeSearchIcons => 'Tìm biểu tượng';

  @override
  String get financeNoIconsFound => 'Không tìm thấy biểu tượng';

  @override
  String get financePreview => 'Xem trước';

  @override
  String get financeNoColor => 'Chưa có màu';

  @override
  String get financePickColor => 'Chọn màu';

  @override
  String get financeInvalidColor => 'Nhập mã màu hex hợp lệ';

  @override
  String get financeRandomizeColor => 'Ngẫu nhiên';

  @override
  String get financeToday => 'Hôm nay';

  @override
  String get financeYesterday => 'Hôm qua';

  @override
  String get financeNet => 'Ròng';

  @override
  String get financeNetBalance => 'Số dư ròng';

  @override
  String get financeYourWallets => 'Ví của bạn';

  @override
  String get financeQuickActions => 'Thao tác nhanh';

  @override
  String financeWalletSummaryHint(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Đã có $count ví sẵn sàng sử dụng',
      one: 'Đã có 1 ví sẵn sàng sử dụng',
      zero: 'Chưa cấu hình ví nào',
    );
    return '$_temp0';
  }

  @override
  String get financeAddTransaction => 'Thêm';

  @override
  String get financeAddFirstTransaction => 'Thêm giao dịch đầu tiên';

  @override
  String get financeCreateFirstWallet => 'Tạo ví đầu tiên';

  @override
  String get financeTransfer => 'Chuyển khoản';

  @override
  String get financeTransactionCountShort => 'gd';

  @override
  String get financeExchangeRate => 'Tỷ giá';

  @override
  String get financeDestinationAmountAuto => 'Tự động';

  @override
  String get financeDestinationAmountOverride => 'Thủ công';

  @override
  String get financeDestinationAmountAutoHint => 'Tự động điền từ tỷ giá thực tế';

  @override
  String get financeDestinationAmountOverrideHint => 'Dùng số tiền tùy chỉnh — nhấn để chuyển sang tự động';

  @override
  String get financeInvertRate => 'Đảo tỷ giá';

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
  String get timerRunningSessionNoDetails => 'Chưa liên kết danh mục hoặc nhiệm vụ';

  @override
  String get timerRunningSessionNoTitle => 'Phiên không có tiêu đề';

  @override
  String get timerPaused => 'Tạm dừng';

  @override
  String get timerStopped => 'Đã dừng';

  @override
  String get timerSessionPauseSuccess => 'Đã tạm dừng phiên thành công.';

  @override
  String get timerSessionResumeSuccess => 'Đã tiếp tục phiên thành công.';

  @override
  String get timerSessionStopSuccess => 'Đã dừng phiên thành công.';

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
  String get timerCategoryColor => 'Màu sắc';

  @override
  String get timerCategoryColorLime => 'Xanh chanh';

  @override
  String get timerCategoryColorTeal => 'Xanh mòng két';

  @override
  String get timerCategoryColorSky => 'Xanh da trời';

  @override
  String get timerCategoryColorRose => 'Hồng hoa hồng';

  @override
  String get timerCategoryDescription => 'Mô tả';

  @override
  String get timerCategoryColorNone => 'Không';

  @override
  String get timerCreateCategory => 'Tạo danh mục';

  @override
  String get timerCategoryCreateInProgress => 'Đang tạo danh mục...';

  @override
  String get timerCategoryCreateSuccess => 'Đã tạo danh mục';

  @override
  String get timerSelectCategory => 'Chọn danh mục';

  @override
  String get timerAdvanced => 'Nâng cao';

  @override
  String get timerSessionDescription => 'Mô tả';

  @override
  String get timerLinkTask => 'Nhiệm vụ';

  @override
  String get timerTaskPickerAllTasks => 'Tất cả nhiệm vụ';

  @override
  String get timerTaskPickerAssignedToMe => 'Giao cho tôi';

  @override
  String timerTaskPickerAssignees(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count người phụ trách',
      one: '$count người phụ trách',
      zero: 'Không có người phụ trách',
    );
    return '$_temp0';
  }

  @override
  String get timerTaskPickerNoMatchingTasks => 'Không tìm thấy nhiệm vụ phù hợp';

  @override
  String get timerTaskPickerNoTask => 'Không liên kết nhiệm vụ';

  @override
  String timerTaskPickerResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count nhiệm vụ',
      one: '$count nhiệm vụ',
      zero: 'Không có nhiệm vụ',
    );
    return '$_temp0';
  }

  @override
  String get timerTaskPickerSearch => 'Tìm kiếm nhiệm vụ';

  @override
  String get timerTaskIdPlaceholder => 'Chọn nhiệm vụ';

  @override
  String timerAttachmentCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tệp đính kèm',
      one: '1 tệp đính kèm',
      zero: 'Không có tệp đính kèm',
    );
    return '$_temp0';
  }

  @override
  String get timerRecentSessions => 'Phiên gần đây';

  @override
  String get timerSeeAll => 'Xem tất cả';

  @override
  String get timerNoSessions => 'Chưa có phiên nào';

  @override
  String get timerHistoryNoSessionsForPeriod => 'Không có phiên nào trong khoảng thời gian này';

  @override
  String get timerHistoryOverview => 'Tổng quan theo kỳ';

  @override
  String get timerHistoryTotalTime => 'Tổng thời gian';

  @override
  String get timerHistoryLoadMore => 'Tải thêm';

  @override
  String get timerHistoryEndOfList => 'Bạn đã xem hết danh sách';

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
  String get timerStatsPersonal => 'Cá nhân';

  @override
  String get timerStatsWorkspace => 'Không gian làm việc';

  @override
  String get timerActivityHeatmap => 'Hoạt động';

  @override
  String timerHeatmapTrackedThisYear(String duration) {
    return 'Đã theo dõi $duration trong năm nay';
  }

  @override
  String get timerHeatmapStartTracking => 'Bắt đầu theo dõi để xây dựng nhịp hoạt động của bạn';

  @override
  String get timerHeatmapViewOriginal => 'Gốc';

  @override
  String get timerHeatmapViewHybrid => 'Kết hợp';

  @override
  String get timerHeatmapViewCalendarOnly => 'Lịch';

  @override
  String get timerHeatmapViewCompactCards => 'Thẻ';

  @override
  String get timerHeatmapLegendLess => 'Ít';

  @override
  String get timerHeatmapLegendMore => 'Nhiều';

  @override
  String timerHeatmapMonthCompact(int month) {
    return 'Thg $month';
  }

  @override
  String timerHeatmapMonthNarrowColumn(int month) {
    return '$month';
  }

  @override
  String get timerHeatmapYearPattern => 'Mẫu hoạt động';

  @override
  String timerHeatmapActiveDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ngày hoạt động',
      one: '$count ngày hoạt động',
    );
    return '$_temp0';
  }

  @override
  String get timerHeatmapMon => 'T2';

  @override
  String get timerHeatmapTue => 'T3';

  @override
  String get timerHeatmapWed => 'T4';

  @override
  String get timerHeatmapThu => 'T5';

  @override
  String get timerHeatmapFri => 'T6';

  @override
  String get timerHeatmapSat => 'T7';

  @override
  String get timerHeatmapSun => 'CN';

  @override
  String timerHeatmapSessions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count phiên',
      one: '$count phiên',
    );
    return '$_temp0';
  }

  @override
  String get timerHeatmapTotal => 'Tổng';

  @override
  String get timerHeatmapSessionsLabel => 'Phiên';

  @override
  String get timerHeatmapActiveDaysLabel => 'Ngày hoạt động';

  @override
  String get timerHeatmapLessThanMinute => '<1p';

  @override
  String get timerHeatmapNoActivityYet => 'Chưa có hoạt động';

  @override
  String get timerViewSessionDetails => 'Chi tiết phiên';

  @override
  String get timerEditSession => 'Sửa phiên';

  @override
  String get timerSessionUpdated => 'Đã cập nhật phiên';

  @override
  String get timerSessionDeleted => 'Đã xóa phiên';

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
  String get timerInvalidDuration => 'Thời lượng không hợp lệ';

  @override
  String get timerUnknownDate => 'Ngày không xác định';

  @override
  String get timerSave => 'Lưu';

  @override
  String get timerPomodoro => 'Pomodoro';

  @override
  String get timerPomodoroSettings => 'Cài đặt Pomodoro';

  @override
  String get timerPomodoroSettingsDescription => 'Điều chỉnh thời gian tập trung, thời gian nghỉ và tự động chuyển giữa các phiên.';

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
  String get timerRequestsFilterAllStatuses => 'Tất cả';

  @override
  String get timerRequestsFilterTitle => 'Lọc yêu cầu';

  @override
  String get timerRequestsFilterStatusLabel => 'Trạng thái';

  @override
  String get timerRequestsFilterUserLabel => 'Người dùng';

  @override
  String get timerRequestsFilterAllUsers => 'Tất cả người dùng';

  @override
  String get timerRequestsFilterClear => 'Xóa bộ lọc';

  @override
  String get timerRequestsFilterApply => 'Áp dụng bộ lọc';

  @override
  String get timerRequestPending => 'Đang chờ';

  @override
  String get timerRequestApproved => 'Đã duyệt';

  @override
  String get timerRequestRejected => 'Bị từ chối';

  @override
  String get timerRequestNeedsInfo => 'Cần thêm thông tin';

  @override
  String timerRequestInfoRequestedBy(String name) {
    return 'Đã yêu cầu thông tin bởi $name';
  }

  @override
  String get timerApprove => 'Duyệt';

  @override
  String get timerReject => 'Từ chối';

  @override
  String get timerRequestInfo => 'Yêu cầu thông tin';

  @override
  String get timerRequestResubmit => 'Gửi lại yêu cầu';

  @override
  String get timerRequestEdit => 'Chỉnh sửa';

  @override
  String get timerRequestEditRequest => 'Chỉnh sửa yêu cầu';

  @override
  String get timerRequestDescription => 'Mô tả';

  @override
  String get timerRequestDescriptionOptional => 'Mô tả (không bắt buộc)';

  @override
  String get timerRequestComments => 'Bình luận';

  @override
  String get timerRequestNoComments => 'Chưa có bình luận';

  @override
  String get timerRequestAddComment => 'Thêm bình luận...';

  @override
  String get timerRequestPostComment => 'Đăng';

  @override
  String get timerRequestCancelEditComment => 'Hủy';

  @override
  String get timerRequestDeleteComment => 'Xóa bình luận';

  @override
  String get timerRequestDeleteCommentConfirm => 'Xóa bình luận này?';

  @override
  String get timerRequestActivity => 'Hoạt động';

  @override
  String get timerRequestNoActivity => 'Chưa có hoạt động';

  @override
  String get timerRequestActivityCreated => 'đã tạo yêu cầu này';

  @override
  String get timerRequestActivityContentUpdated => 'đã cập nhật nội dung yêu cầu';

  @override
  String get timerRequestActivityStatusChanged => 'đã thay đổi trạng thái yêu cầu';

  @override
  String get timerRequestActivityCommentAdded => 'đã thêm bình luận';

  @override
  String get timerRequestActivityCommentUpdated => 'đã cập nhật bình luận';

  @override
  String get timerRequestActivityCommentDeleted => 'đã xóa bình luận';

  @override
  String get timerRequestActivityUpdated => 'đã cập nhật yêu cầu này';

  @override
  String taskBoardDetailTaskAssigneeCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count người được giao',
      one: '$count người được giao',
    );
    return '$_temp0';
  }

  @override
  String get timerRequestActivityFeedbackLabel => 'Phản hồi';

  @override
  String get timerRequestActivityTitleLabel => 'Tiêu đề';

  @override
  String get timerRequestActivityUnknownUser => 'Người dùng không xác định';

  @override
  String get timerRequestActivityItemsPerPage => 'Mục mỗi trang';

  @override
  String timerRequestActivityPageInfo(int current, int total) {
    return 'Trang $current / $total';
  }

  @override
  String get timerRequestActivityActionCreated => 'đã tạo';

  @override
  String get timerRequestActivityActionStatusChanged => 'đã thay đổi trạng thái';

  @override
  String get timerRequestActivityActionContentUpdated => 'đã cập nhật nội dung';

  @override
  String get timerRequestActivityActionCommentAdded => 'đã thêm bình luận';

  @override
  String get timerRequestActivityActionCommentUpdated => 'đã cập nhật bình luận';

  @override
  String get timerRequestActivityActionCommentDeleted => 'đã xóa bình luận';

  @override
  String get timerRequestActivityFieldStartTime => 'Thời gian bắt đầu';

  @override
  String get timerRequestActivityFieldEndTime => 'Thời gian kết thúc';

  @override
  String get timerRequestActivityFieldTitle => 'Tiêu đề';

  @override
  String get timerRequestActivityFieldDescription => 'Mô tả';

  @override
  String get timerRequestAddImage => 'Thêm ảnh';

  @override
  String timerRequestProofImagesCount(int current, int max) {
    return 'Ảnh: $current/$max';
  }

  @override
  String get timerReasonOptional => 'Lý do (không bắt buộc)';

  @override
  String get timerInfoRequired => 'Thông tin (bắt buộc)';

  @override
  String get timerSubmitInfo => 'Gửi thông tin';

  @override
  String get timerRequestUpdated => 'Đã cập nhật yêu cầu';

  @override
  String get timerManagementTitle => 'Quản lý';

  @override
  String get timerSearchSessions => 'Tìm kiếm phiên...';

  @override
  String get timerDescription => 'Mô tả';

  @override
  String get timerWorkSession => 'Phiên làm việc';

  @override
  String get timerSubmitForApproval => 'Gửi duyệt';

  @override
  String get timerRequestSubmittedTitle => 'Đã gửi yêu cầu';

  @override
  String get timerRequestSubmittedContent => 'Mục thời gian của bạn đã được gửi để duyệt.';

  @override
  String get timerRequestRejectionReason => 'Lý do từ chối';

  @override
  String get timerRequestNeedsInfoReason => 'Lý do cần thêm thông tin';

  @override
  String get timerMissedEntrySavedTitle => 'Đã lưu mục';

  @override
  String get timerMissedEntrySavedContent => 'Mục thời gian bỏ lỡ của bạn đã được thêm thành công.';

  @override
  String get timerSessionExceeded => 'Phiên vượt ngưỡng';

  @override
  String get timerSessionExceededDescription => 'Phiên này đã vượt quá ngưỡng thời gian của không gian làm việc. Bạn có thể hủy phiên hoặc gửi yêu cầu để được duyệt.';

  @override
  String get timerTimeEditingRestricted => 'Chỉnh Sửa Thời Gian Bị Hạn Chế';

  @override
  String timerAllEditsRequireApproval(String date) {
    return 'Tất cả các chỉnh sửa thời gian phải được gửi dưới dạng yêu cầu phê duyệt. Phiên này từ $date.';
  }

  @override
  String get timerDiscardSession => 'Hủy phiên';

  @override
  String get timerSubmitAsRequest => 'Gửi yêu cầu';

  @override
  String get timerThresholdWarningAll => 'Mọi mục bổ sung trong không gian làm việc này đều cần được duyệt. Vui lòng thêm ít nhất một ảnh minh chứng trước khi gửi.';

  @override
  String timerThresholdWarning(int days) {
    return 'Các mục cũ hơn $days ngày cần được duyệt. Vui lòng thêm ít nhất một ảnh minh chứng trước khi gửi.';
  }

  @override
  String get timerProofOfWorkRequired => 'Cần ít nhất một ảnh minh chứng.';

  @override
  String get timerRequestsThresholdTitle => 'Cài đặt ngưỡng yêu cầu';

  @override
  String get timerRequestsThresholdDescription => 'Chọn thời điểm mục bị thiếu cần gửi yêu cầu duyệt.';

  @override
  String get timerRequestsThresholdNoApproval => 'Không cần duyệt';

  @override
  String get timerRequestsThresholdNoApprovalHint => 'Có thể thêm mục bị thiếu trực tiếp mà không cần gửi yêu cầu.';

  @override
  String get timerRequestsThresholdLabel => 'Ngưỡng (ngày)';

  @override
  String get timerRequestsThresholdHelp => 'Các mục cũ hơn số ngày này phải gửi yêu cầu để được duyệt.';

  @override
  String get timerRequestsThresholdInvalid => 'Nhập số nguyên lớn hơn hoặc bằng 0.';

  @override
  String get timerRequestsStatusChangeGracePeriodLabel => 'Thời gian gia hạn cho phép đổi giữa Đã duyệt và Đã từ chối (phút)';

  @override
  String get timerRequestsStatusChangeGracePeriodHelp => 'Đặt số phút cho phép người duyệt hoàn tác trạng thái giữa Đã duyệt và Đã từ chối theo cả hai chiều. Đặt 0 để tắt cả hai thao tác.';

  @override
  String get timerRequestsStatusChangeGracePeriodInvalid => 'Nhập số nguyên lớn hơn hoặc bằng 0 cho thời gian gia hạn hoàn tác trạng thái.';

  @override
  String get timerRequestsThresholdUpdated => 'Đã cập nhật ngưỡng yêu cầu.';

  @override
  String get timerRequestRevertToApproved => 'Hoàn tác về Đã duyệt';

  @override
  String get timerRequestRevertToRejected => 'Hoàn tác về Đã từ chối';

  @override
  String get timerRequestLastModifiedBy => 'Chỉnh sửa gần nhất bởi';

  @override
  String timerRequestApprovedByAt(String name, String date) {
    return 'Đã duyệt bởi $name vào $date';
  }

  @override
  String timerRequestRejectedByAt(String name, String date) {
    return 'Đã từ chối bởi $name vào $date';
  }

  @override
  String get timerAutoStartBreaks => 'Tự động bắt đầu nghỉ';

  @override
  String get timerAutoStartFocus => 'Tự động bắt đầu tập trung';

  @override
  String get commonCancel => 'Hủy';

  @override
  String get timerTotalSessions => 'Tổng số phiên';

  @override
  String get timerActiveUsers => 'Người dùng hoạt động';

  @override
  String get timerGoalsTitle => 'Mục tiêu';

  @override
  String get timerGoalsSubtitle => 'Theo dõi mục tiêu tập trung theo ngày và tuần';

  @override
  String get timerGoalsAdd => 'Thêm mục tiêu';

  @override
  String get timerGoalsCreate => 'Tạo mục tiêu';

  @override
  String get timerGoalsCreateTitle => 'Tạo mục tiêu';

  @override
  String get timerGoalsCreateSuccess => 'Đã tạo mục tiêu';

  @override
  String get timerGoalsEdit => 'Sửa';

  @override
  String get timerGoalsEditTitle => 'Sửa mục tiêu';

  @override
  String get timerGoalsSave => 'Lưu mục tiêu';

  @override
  String get timerGoalsUpdateSuccess => 'Đã cập nhật mục tiêu';

  @override
  String get timerGoalsDelete => 'Xóa';

  @override
  String get timerGoalsDeleteTitle => 'Xóa mục tiêu?';

  @override
  String get timerGoalsDeleteDescription => 'Hành động này không thể hoàn tác.';

  @override
  String get timerGoalsDeleteSuccess => 'Đã xóa mục tiêu';

  @override
  String get timerGoalsOperationFailed => 'Không thể lưu thay đổi mục tiêu.';

  @override
  String get timerGoalsEmptyTitle => 'Chưa có mục tiêu';

  @override
  String get timerGoalsEmptyDescription => 'Tạo mục tiêu đầu tiên để theo dõi tiến độ theo ngày và tuần.';

  @override
  String get timerGoalsCategory => 'Danh mục';

  @override
  String get timerGoalsGeneral => 'Tổng quát';

  @override
  String get timerGoalsDailyMinutes => 'Mục tiêu mỗi ngày (phút)';

  @override
  String get timerGoalsWeeklyMinutesOptional => 'Mục tiêu mỗi tuần (phút, không bắt buộc)';

  @override
  String get timerGoalsDailyValidation => 'Mục tiêu mỗi ngày phải lớn hơn 0.';

  @override
  String get timerGoalsWeeklyValidation => 'Mục tiêu mỗi tuần phải lớn hơn 0.';

  @override
  String get timerGoalsActive => 'Hoạt động';

  @override
  String get timerGoalsInactive => 'Không hoạt động';

  @override
  String get timerGoalsActiveLabel => 'Mục tiêu đang hoạt động';

  @override
  String get timerGoalsDailyProgress => 'Tiến độ ngày';

  @override
  String get timerGoalsWeeklyProgress => 'Tiến độ tuần';

  @override
  String get timerGoalsDailyTarget => 'Mục tiêu ngày';

  @override
  String get timerGoalsWeeklyTarget => 'Mục tiêu tuần';

  @override
  String timerGoalsActiveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# mục tiêu hoạt động',
      one: '# mục tiêu hoạt động',
    );
    return '$_temp0';
  }

  @override
  String get timerHourUnitShort => 'h';

  @override
  String get timerMinuteUnitShort => 'p';

  @override
  String timerDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ngày',
      one: '$count ngày',
    );
    return '$_temp0';
  }

  @override
  String get settingsTitle => 'Cài đặt';

  @override
  String get settingsAccountTab => 'Tài khoản';

  @override
  String get settingsPreferencesTab => 'Tùy chọn';

  @override
  String get settingsAboutTab => 'Giới thiệu';

  @override
  String get settingsLicensesTab => 'Giấy phép';

  @override
  String get settingsProfile => 'Hồ sơ';

  @override
  String get settingsProfileDescription => 'Quản lý thông tin cá nhân và ảnh đại diện của bạn.';

  @override
  String get settingsLanguage => 'Ngôn ngữ';

  @override
  String get settingsLanguageDescription => 'Chọn ngôn ngữ sử dụng trong toàn bộ ứng dụng.';

  @override
  String get settingsAppVersion => 'Phiên bản ứng dụng';

  @override
  String get settingsLanguageSystem => 'Mặc định hệ thống';

  @override
  String get settingsLanguageSystemDescription => 'Tự động theo ngôn ngữ của thiết bị.';

  @override
  String get settingsLanguageEnglish => 'Tiếng Anh';

  @override
  String get settingsLanguageVietnamese => 'Tiếng Việt';

  @override
  String get settingsTheme => 'Giao diện';

  @override
  String get settingsThemeDescription => 'Điều chỉnh giao diện ứng dụng theo thiết bị và sở thích của bạn.';

  @override
  String get settingsThemeLight => 'Sáng';

  @override
  String get settingsThemeDark => 'Tối';

  @override
  String get settingsThemeSystem => 'Hệ thống';

  @override
  String get settingsThemeSystemDescription => 'Tự động theo giao diện của thiết bị.';

  @override
  String get settingsSwitchWorkspace => 'Chuyển không gian làm việc';

  @override
  String get settingsSwitchWorkspaceDescription => 'Di chuyển giữa ngữ cảnh cá nhân và nhóm.';

  @override
  String get settingsCalendar => 'Lịch';

  @override
  String get settingsFirstDayOfWeek => 'Ngày đầu tuần';

  @override
  String get settingsFirstDayOfWeekDescription => 'Kiểm soát cách lịch và tổng kết tuần bắt đầu.';

  @override
  String get settingsFirstDayAuto => 'Tự động';

  @override
  String get settingsFirstDayAutoDescription => 'Dùng mặc định của không gian làm việc hoặc ngôn ngữ khi có thể.';

  @override
  String get settingsFirstDaySunday => 'Chủ nhật';

  @override
  String get settingsFirstDayMonday => 'Thứ hai';

  @override
  String get settingsFirstDaySaturday => 'Thứ bảy';

  @override
  String get settingsHeroDescription => 'Thiết lập cá nhân, ngữ cảnh không gian làm việc và thông tin bản phát hành trong một nơi.';

  @override
  String get settingsSignedInAs => 'Đăng nhập bằng';

  @override
  String get settingsCurrentWorkspace => 'Không gian làm việc hiện tại';

  @override
  String get settingsCurrentWorkspaceDescription => 'Chọn không gian làm việc bạn đang dùng lúc này.';

  @override
  String get settingsDefaultWorkspace => 'Không gian mặc định';

  @override
  String get settingsDefaultWorkspaceDescription => 'Ứng dụng sẽ mở vào đây mặc định mỗi lần khởi động.';

  @override
  String get settingsWorkspacePropertiesTitle => 'Hồ sơ không gian làm việc';

  @override
  String get settingsWorkspacePropertiesDescription => 'Cập nhật tên và ảnh đại diện của không gian làm việc.';

  @override
  String get settingsWorkspacePropertiesNoAccess => 'Bạn cần quyền quản lý cài đặt không gian làm việc để chỉnh sửa.';

  @override
  String get settingsWorkspacePropertiesPermissionLoading => 'Đang kiểm tra quyền trong không gian làm việc...';

  @override
  String get settingsWorkspacePropertiesUpdated => 'Đã cập nhật hồ sơ không gian làm việc.';

  @override
  String get settingsWorkspacePropertiesNameRequired => 'Tên không gian làm việc không được để trống';

  @override
  String get settingsWorkspaceAvatar => 'Ảnh đại diện không gian làm việc';

  @override
  String get settingsWorkspaceAvatarDescription => 'Tải ảnh mới lên hoặc xóa ảnh hiện tại.';

  @override
  String get settingsWorkspaceAvatarRemovePending => 'Ảnh hiện tại sẽ bị xóa khi bạn lưu.';

  @override
  String get settingsWorkspaceNameHint => 'Tên không gian làm việc';

  @override
  String get settingsNoEmail => 'Không có email';

  @override
  String get settingsNoWorkspaceSelected => 'Chưa chọn không gian làm việc';

  @override
  String get settingsWorkspaceActive => 'Đang hoạt động';

  @override
  String get settingsAccountSectionTitle => 'Tài khoản';

  @override
  String get settingsAccountSectionDescription => 'Truy cập hồ sơ và điều khiển phiên đăng nhập.';

  @override
  String get settingsWorkspaceSectionTitle => 'Không gian làm việc';

  @override
  String get settingsWorkspaceSectionDescription => 'Xem ngữ cảnh hiện tại và chuyển khi cần.';

  @override
  String get settingsPreferencesSectionTitle => 'Tùy chọn';

  @override
  String get settingsPreferencesSectionDescription => 'Ngôn ngữ, giao diện và mặc định lịch.';

  @override
  String get settingsDangerSectionTitle => 'Phiên đăng nhập';

  @override
  String get settingsDangerSectionDescription => 'Đăng xuất và kết thúc quyền truy cập trên thiết bị này.';

  @override
  String get settingsQuickOpenProfile => 'Mở hồ sơ';

  @override
  String get settingsQuickSwitchWorkspace => 'Đổi hiện tại';

  @override
  String get settingsQuickDefaultWorkspace => 'Không gian mặc định';

  @override
  String get settingsDataStatusLabel => 'Dữ liệu';

  @override
  String get settingsDataStatusLive => 'Trực tiếp';

  @override
  String get settingsDataStatusCached => 'Đã lưu';

  @override
  String get settingsDataStatusRefreshing => 'Đang làm mới';

  @override
  String get settingsPullToRefreshAction => 'Làm mới ngay';

  @override
  String get settingsSignOut => 'Đăng xuất';

  @override
  String get settingsSignOutDescription => 'Kết thúc phiên đăng nhập trên thiết bị này.';

  @override
  String get settingsSignOutConfirm => 'Bạn có chắc muốn đăng xuất không?';

  @override
  String get settingsAboutSummary => 'Tuturuuu mobile giữ các công cụ không gian làm việc, trợ lý và luồng làm việc hằng ngày luôn trong tầm tay.';

  @override
  String get settingsAboutSectionTitle => 'Giới thiệu ứng dụng';

  @override
  String get settingsAboutSectionDescription => 'Thông tin bản phát hành và sản phẩm của bản dựng này.';

  @override
  String get settingsVersionLabel => 'Phiên bản';

  @override
  String get settingsBuildLabel => 'Bản dựng';

  @override
  String get settingsPackageLabel => 'Gói';

  @override
  String get settingsVersionTileDescription => 'Bản phát hành hiện được cài trên thiết bị này.';

  @override
  String get settingsLicensesSectionTitle => 'Giấy phép mã nguồn mở';

  @override
  String get settingsLicensesSectionDescription => 'Xem các thông báo phần mềm bên thứ ba được đóng gói trong ứng dụng.';

  @override
  String get settingsLicenseViewerTitle => 'Mở trình xem giấy phép';

  @override
  String get settingsLicenseViewerDescription => 'Duyệt các giấy phép Flutter, plugin và package có trong bản dựng này.';

  @override
  String get settingsLicenseVersionDescription => 'Đối chiếu phiên bản đã cài khi xem thông báo.';

  @override
  String get settingsMinutesUnit => 'phút';

  @override
  String get profileTitle => 'Hồ sơ';

  @override
  String get profileIdentitySectionTitle => 'Danh tính';

  @override
  String get profileIdentitySectionDescription => 'Giữ các thông tin cốt lõi mà mọi người thấy về tài khoản của bạn luôn cập nhật.';

  @override
  String get profileAvatar => 'Ảnh đại diện';

  @override
  String get profileAvatarSet => 'Đã gắn ảnh';

  @override
  String get profileAvatarDescription => 'Tải lên ảnh đại diện của bạn';

  @override
  String get profileAvatarSectionTitle => 'Ảnh đại diện';

  @override
  String get profileAvatarActionDescription => 'Chọn ảnh mới hoặc làm mới ảnh hiện đang gắn với tài khoản.';

  @override
  String get profileAvatarPickerDescription => 'Chọn nơi lấy ảnh đại diện mới của bạn.';

  @override
  String get profileUploadAvatar => 'Tải lên ảnh đại diện';

  @override
  String get profileChangeAvatar => 'Thay đổi ảnh đại diện';

  @override
  String get profileRemoveAvatar => 'Xóa ảnh đại diện';

  @override
  String get profileRemoveAvatarDescription => 'Xóa ảnh hiện tại khỏi hồ sơ tài khoản của bạn.';

  @override
  String get profileRemoveConfirm => 'Xóa ảnh đại diện?';

  @override
  String get profileAccountStatus => 'Trạng thái tài khoản';

  @override
  String get profileAccountStatusDescription => 'Chi tiết thành viên và xác minh của tài khoản này.';

  @override
  String get profileStatus => 'Trạng thái';

  @override
  String get profileStatusUnknown => 'Không rõ';

  @override
  String get profileVerification => 'Xác minh';

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
  String get profileDisplayNameDescription => 'Tên này xuất hiện ở các bề mặt cộng tác trong ứng dụng.';

  @override
  String get profileDisplayNameRequired => 'Tên hiển thị không được để trống';

  @override
  String get profileFullName => 'Tên đầy đủ';

  @override
  String get profileFullNameHint => 'Tên đầy đủ của bạn';

  @override
  String get profileFullNameDescription => 'Dùng tên pháp lý hoặc tên đầy đủ bạn muốn lưu trong hồ sơ tài khoản.';

  @override
  String get profileFullNameRequired => 'Tên đầy đủ không được để trống';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileEmailDescription => 'Khi cập nhật email, thư xác nhận sẽ được gửi đến cả địa chỉ cũ và mới.';

  @override
  String get profileInvalidEmail => 'Vui lòng nhập địa chỉ email hợp lệ';

  @override
  String get profileCurrentEmail => 'Email hiện tại';

  @override
  String get profileNewEmail => 'Email mới';

  @override
  String get profileMissingValue => 'Chưa đặt';

  @override
  String get profileDangerAction => 'Nguy hiểm';

  @override
  String profileEmailPendingChange(String email) {
    return 'Đang chờ đổi sang $email';
  }

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
  String get workspacePickerTitle => 'Không gian làm việc';

  @override
  String get workspaceDefaultPickerTitle => 'Không gian mặc định';

  @override
  String get workspaceCurrentBadge => 'Hiện tại';

  @override
  String get workspaceDefaultBadge => 'Mặc định';

  @override
  String get workspacePersonalBadge => 'Cá nhân';

  @override
  String get workspacePersonalSection => 'Cá nhân';

  @override
  String get workspaceSystemBadge => 'Hệ thống';

  @override
  String get workspaceSystemSection => 'Hệ thống';

  @override
  String get workspaceTeamSection => 'Nhóm làm việc';

  @override
  String get workspaceCreateTitle => 'Tạo không gian làm việc';

  @override
  String get workspaceCreateDescription => 'Tạo một không gian mới cho dự án, thói quen, tài chính và nhiều hơn nữa.';

  @override
  String get workspaceCreateSuccess => 'Đã tạo không gian làm việc.';

  @override
  String get workspaceCreateSuccessAvatarWarning => 'Đã tạo không gian làm việc, nhưng ảnh đại diện không tải lên được.';

  @override
  String get workspaceCreateError => 'Không thể tạo không gian làm việc';

  @override
  String get workspaceCreateNew => 'Tạo mới';

  @override
  String get workspaceCreateNameHint => 'Tên không gian làm việc';

  @override
  String get workspaceCreateNameRequired => 'Vui lòng nhập tên không gian làm việc';

  @override
  String get workspaceCreateSubmit => 'Tạo không gian làm việc';

  @override
  String get workspaceCreateCancel => 'Hủy';

  @override
  String get workspaceCreatePrompt => 'Tạo không gian làm việc đầu tiên để bắt đầu';

  @override
  String get workspaceCreateLimitReached => 'Bạn đã đạt giới hạn không gian làm việc';

  @override
  String workspaceCreateLimitInfo(int current, int limit) {
    return '$current / $limit không gian làm việc đã dùng';
  }

  @override
  String get mfaTitle => 'Xác thực hai yếu tố';

  @override
  String get mfaSubtitle => 'Nhập mã từ ứng dụng xác thực của bạn';

  @override
  String get mfaCodeLabel => 'Mã gồm 6 chữ số';

  @override
  String get mfaVerify => 'Xác thực';

  @override
  String get mfaInvalidCode => 'Mã xác thực không hợp lệ. Vui lòng thử lại.';

  @override
  String get mfaSignOut => 'Đăng xuất';

  @override
  String get captchaError => 'Kiểm tra bảo mật thất bại. Vui lòng thử lại.';

  @override
  String get commonSomethingWentWrong => 'Đã xảy ra lỗi';

  @override
  String get selectImageSource => 'Chọn nguồn ảnh';

  @override
  String get camera => 'Camera';

  @override
  String get gallery => 'Thư viện';

  @override
  String get commonRetry => 'Thử lại';

  @override
  String get commonPressBackAgainToExit => 'Nhấn quay lại lần nữa để thoát';

  @override
  String get commonPressBackAgainToExitHint => 'Nhấn quay lại lần nữa trong vòng 2 giây để đóng ứng dụng.';

  @override
  String get commonPrevious => 'Trước';

  @override
  String get commonNext => 'Tiếp';

  @override
  String get onboardingSlide1Title => 'Gặp gỡ Mira';

  @override
  String get onboardingSlide1Subtitle => 'Người bạn đồng hành AI cho công việc và cuộc sống. Mira kết nối công việc, lịch và tài chính của bạn.';

  @override
  String get onboardingSlide2Title => 'Tất cả trong một ứng dụng';

  @override
  String get onboardingSlide2Subtitle => 'Công việc, Lịch và Theo dõi - tất cả đều được thống nhất. Không còn phải chuyển đổi giữa các ứng dụng.';

  @override
  String get onboardingSlide3Title => 'Trí tuệ phát triển cùng bạn';

  @override
  String get onboardingSlide3Subtitle => 'Mira ghi nhớ sở thích của bạn và trở nên thông minh hơn khi bạn sử dụng nhiều hơn.';

  @override
  String get onboardingGetStarted => 'Bắt đầu ngay';
}
