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
  String get authTagline => 'Người bạn đồng hành AI cho công việc';

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
  String get workspaceSelectError => 'Không thể chuyển không gian làm việc';

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
  String get navApps => 'Ứng dụng';

  @override
  String get navAssistant => 'Trợ lý';

  @override
  String get appsHubSearchHint => 'Tìm kiếm ứng dụng';

  @override
  String get appsHubQuickAccess => 'Truy cập nhanh';

  @override
  String get appsHubAllApps => 'Tất cả ứng dụng';

  @override
  String get appsHubEmpty => 'Không tìm thấy ứng dụng';

  @override
  String get assistantComingSoon => 'Sắp ra mắt';

  @override
  String get dashboardGreeting => 'Chào mừng trở lại!';

  @override
  String get dashboardQuickActions => 'Thao tác nhanh';

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
  String get taskBoardsListsCount => 'danh sách';

  @override
  String get taskBoardsTasksCount => 'công việc';

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
  String get financeTransactionDetails => 'Chi tiết giao dịch';

  @override
  String get financeCreateTransaction => 'Tạo giao dịch';

  @override
  String get financeEditTransaction => 'Sửa giao dịch';

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
  String get timerRequestsThresholdUpdated => 'Đã cập nhật ngưỡng yêu cầu.';

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
  String get settingsCalendar => 'Lịch';

  @override
  String get settingsFirstDayOfWeek => 'Ngày đầu tuần';

  @override
  String get settingsFirstDayAuto => 'Tự động';

  @override
  String get settingsFirstDaySunday => 'Chủ nhật';

  @override
  String get settingsFirstDayMonday => 'Thứ hai';

  @override
  String get settingsFirstDaySaturday => 'Thứ bảy';

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
  String get profileStatus => 'Trạng thái';

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
  String get profileDisplayNameRequired => 'Tên hiển thị không được để trống';

  @override
  String get profileFullName => 'Tên đầy đủ';

  @override
  String get profileFullNameHint => 'Tên đầy đủ của bạn';

  @override
  String get profileFullNameRequired => 'Tên đầy đủ không được để trống';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileInvalidEmail => 'Vui lòng nhập địa chỉ email hợp lệ';

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
  String get workspacePersonalSection => 'Cá nhân';

  @override
  String get workspaceTeamSection => 'Nhóm làm việc';

  @override
  String get workspaceCreateTitle => 'Tạo không gian làm việc';

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
