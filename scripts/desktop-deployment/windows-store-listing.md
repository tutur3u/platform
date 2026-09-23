# Tuturuuu Microsoft Store listing draft

Product: `9N7B6VC7RR7W` · Publisher: Tuturuuu · Category: Productivity
Privacy policy: https://tuturuuu.com/privacy
Support: https://tuturuuu.com/contact
Website: https://tuturuuu.com

## English

**Short description:** Your workspace for tasks, calendars, mail, and teamwork.

**Description:**
Tuturuuu brings your workspaces together in one desktop app. Sign in to access
your tasks, calendars, mail, and the tools available to your workspace. Switch
between personal and team workspaces while keeping each workspace's information
separate.

Use the desktop app to organize work, review updates, and continue conversations
with your team. Camera, microphone, and file access are requested when you choose
a feature that needs them.

This is an early-access release. An internet connection and a Tuturuuu account
are required. Available features depend on your workspace, permissions, and plan.

**Features:**
- Personal and team workspaces
- Task and calendar organization
- Workspace mail and collaboration tools
- English and Vietnamese interfaces
- Updates delivered through Microsoft Store

**Release notes:** Initial Microsoft Store early-access release.

## Tiếng Việt

**Mô tả ngắn:** Không gian làm việc cho công việc, lịch, thư và cộng tác nhóm.

**Mô tả:**
Tuturuuu kết nối các không gian làm việc trong một ứng dụng trên máy tính.
Đăng nhập để truy cập công việc, lịch, thư và những công cụ được cấp cho không
gian làm việc của bạn. Chuyển đổi giữa không gian cá nhân và nhóm, đồng thời giữ
thông tin của từng không gian riêng biệt.

Sắp xếp công việc, xem cập nhật và tiếp tục trao đổi với nhóm ngay trên máy tính.
Ứng dụng chỉ yêu cầu quyền camera, micrô hoặc truy cập tệp khi bạn chọn tính năng
cần dùng những quyền đó.

Đây là phiên bản truy cập sớm. Bạn cần có kết nối Internet và tài khoản Tuturuuu.
Các tính năng khả dụng phụ thuộc vào không gian làm việc, quyền và gói dịch vụ.

**Tính năng:**
- Không gian làm việc cá nhân và nhóm
- Quản lý công việc và lịch
- Thư và công cụ cộng tác trong không gian làm việc
- Giao diện tiếng Anh và tiếng Việt
- Cập nhật qua Microsoft Store

**Ghi chú phát hành:** Phiên bản truy cập sớm đầu tiên trên Microsoft Store.

## Reviewer notes and declarations to validate before submission

The application is a Flutter Win32 desktop client packaged as MSIX. It requires
`runFullTrust` to launch the Flutter Windows runner and its native plugins.
The protocol `com.tuturuuu.app.mobile` returns the user's browser authentication
flow to the installed app. The Store channel does not download or execute app
updates from GitHub; Microsoft Store handles package updates.

Camera and microphone support user-initiated communication features. The package
must pass real Windows tests before these features appear as verified listing
claims. Capture screenshots from this exact MSIX build with sample data; do not
use mobile screenshots or expose private user/workspace content.

Before certification, complete Partner Center's privacy/data and age-rating
questionnaires from the actual app behavior, including account information,
user-generated content, messaging, external AI processing, and any linked paid
services. Do not infer an age rating or assert that no personal data is collected.
Provide a dedicated reviewer account/workspace or verified self-service signup
instructions; never attach an owner's credentials or private workspace access.

Pending assets: Windows screenshots, Store logo review, optional promotional art.
Pending evidence: WACK, clean-machine install/uninstall, browser sign-in, file
picker, camera/microphone consent, workspace isolation, Store update behavior.
