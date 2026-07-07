import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  userId: z.guid(), // virtual user id / workspace user id
  wsId: z.string().min(1),
});

export const POST = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string; userId: string }
      | Promise<{ wsId: string; courseId: string; userId: string }>
  ) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          {
            message: 'Invalid route params',
            errors: parsedParams.error.issues,
          },
          { status: 400 }
        );
      }

      const { wsId, courseId, userId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'view_user_groups',
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const normalizedWsId = access.normalizedWsId;

      // 1. Verify course
      const course = await validateTeachCourse({
        courseId,
        db: access.sbAdmin,
        wsId: normalizedWsId,
      });
      if (!course) {
        return NextResponse.json(
          { message: 'Course not found' },
          { status: 404 }
        );
      }

      // 2. Fetch the student profile
      const { data: member } = await access.sbAdmin
        .from('workspace_user_groups_users')
        .select(
          `user_id,
           role,
           profile:workspace_users!workspace_user_roles_users_user_id_fkey(id, display_name, full_name, email)`
        )
        .eq('group_id', courseId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!member) {
        return NextResponse.json(
          { message: 'Student not enrolled in this course' },
          { status: 404 }
        );
      }

      const profile = (
        Array.isArray(member.profile) ? member.profile[0] : member.profile
      ) as {
        id: string;
        display_name: string | null;
        full_name: string | null;
        email: string | null;
      } | null;

      if (!profile?.email) {
        return NextResponse.json(
          { message: 'Student email is not available' },
          { status: 400 }
        );
      }

      const isVi = true; // Always send performance reports in Vietnamese as requested

      // 3. Get course modules and quizzes
      const { data: modules } = await access.sbAdmin
        .from('workspace_course_modules')
        .select('id')
        .eq('group_id', courseId);

      const moduleIds = (modules ?? []).map((m) => m.id);
      const totalModules = moduleIds.length;

      const { count: totalQuizzes } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quizzes')
            .select('id', { count: 'exact', head: true })
            .in('module_id', moduleIds)
        : { count: 0 };

      // 4. Get student submissions
      const { data: submissions } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quiz_submissions')
            .select('user_id, module_id, is_correct, created_at')
            .in('module_id', moduleIds)
        : { data: [] };

      // Get user link to find this student's platform user ID
      const { data: userLink } = await access.sbAdmin
        .from('workspace_user_linked_users')
        .select('platform_user_id')
        .eq('ws_id', normalizedWsId)
        .eq('virtual_user_id', userId)
        .maybeSingle();

      const platformUserId = userLink?.platform_user_id;

      // Filter submissions for this student
      const studentSubs = platformUserId
        ? (submissions ?? []).filter((s) => s.user_id === platformUserId)
        : [];

      const answeredCount = studentSubs.length;
      const correctCount = studentSubs.filter(
        (s) => s.is_correct === true
      ).length;
      const pendingGradingCount = studentSubs.filter(
        (s) => s.is_correct === null
      ).length;

      const gradedCount = answeredCount - pendingGradingCount;
      const scorePercent =
        gradedCount > 0 ? Math.round((correctCount / gradedCount) * 100) : null;

      const modulesWithSubs = new Set(studentSubs.map((s) => s.module_id));
      const completedModules = moduleIds.filter((mid) =>
        modulesWithSubs.has(mid)
      ).length;

      // 5. Render beautiful responsive HTML Email Template with Localization
      const studentName =
        profile.display_name ??
        profile.full_name ??
        (isVi ? 'Học sinh' : 'Student');
      const escapedCourseName = escapeHtml(course.name);
      const escapedStudentName = escapeHtml(studentName);
      const learnerDashboardHref = escapeHtml(
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.localhost'}/${encodeURIComponent(wsId)}`
      );

      const emailContent = {
        subject: isVi
          ? `[Tuturuuu] Báo cáo học tập - ${course.name}`
          : `[Tuturuuu] Study Report - ${course.name}`,
        title: isVi ? 'Báo cáo học tập' : 'Study Report',
        subtitle: isVi
          ? 'Tóm tắt tiến trình học tập cá nhân'
          : 'Personal learning progress summary',
        hello: isVi
          ? `Xin chào <strong>${escapedStudentName}</strong>,`
          : `Hello <strong>${escapedStudentName}</strong>,`,
        intro: isVi
          ? `Dưới đây là báo cáo kết quả học tập hiện tại của bạn cho khóa học <strong>${escapedCourseName}</strong>. Hãy tiếp tục luyện tập và hoàn thành các bài học nhé!`
          : `Here is your current performance report for <strong>${escapedCourseName}</strong>. Keep practicing and reviewing modules to maintain steady progress.`,
        avgScore: isVi ? 'Điểm trung bình' : 'Avg. Score',
        modulesDone: isVi ? 'Module đã xong' : 'Modules Done',
        quizPractice: isVi ? 'Luyện tập quiz' : 'Quiz Practice',
        cta: isVi
          ? 'Đi tới bảng điều khiển học viên'
          : 'Go to Learner Dashboard',
        footer: isVi
          ? `Báo cáo học tập được gửi tự động từ giảng viên của bạn.<br>Hệ thống giáo dục Tuturuuu &copy; 2026`
          : `This is an automated performance report from your instructor.<br>Tuturuuu Teach Platform &copy; 2026`,
        pending: isVi ? 'Đang chờ' : 'Pending',
        modulesUnit: isVi ? 'module' : 'modules',
        answeredUnit: isVi ? 'câu' : 'answered',
      };

      const scoreText =
        scorePercent !== null ? `${scorePercent}%` : emailContent.pending;
      const progressText = `${completedModules}/${totalModules} ${emailContent.modulesUnit}`;
      const quizText = `${answeredCount}/${totalQuizzes ?? 0} ${emailContent.answeredUnit}`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(emailContent.subject)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      margin: 0;
      padding: 0;
    }
    .wrapper {
      width: 100%;
      background-color: #09090b;
      padding: 50px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #18181b;
      border: 1px solid #27272a;
      padding: 40px 35px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
    }
    .header {
      border-bottom: 1px solid #27272a;
      padding-bottom: 25px;
      margin-bottom: 30px;
    }
    .eyebrow {
      display: inline-block;
      background-color: rgba(234, 179, 8, 0.1);
      border: 1px solid #eab308;
      color: #eab308;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 4px 10px;
      margin-bottom: 14px;
    }
    .title {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.02em;
      margin: 0;
      color: #ffffff;
    }
    .subtitle {
      font-size: 13px;
      color: #a1a1aa;
      margin-top: 6px;
    }
    .greeting {
      font-size: 15px;
      line-height: 1.6;
      color: #e4e4e7;
      margin-bottom: 25px;
    }
    .grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      margin: 35px 0;
    }
    .grid-col {
      display: table-cell;
      background-color: #09090b;
      border: 1px solid #27272a;
      padding: 20px 15px;
      text-align: center;
    }
    .grid-col:not(:last-child) {
      border-right: none;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 900;
      color: #eab308;
      margin: 0;
      letter-spacing: -0.02em;
    }
    .metric-label {
      font-size: 10px;
      font-weight: 700;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 6px;
    }
    .footer {
      border-top: 1px solid #27272a;
      margin-top: 35px;
      padding-top: 25px;
      font-size: 11px;
      color: #71717a;
      text-align: center;
      line-height: 1.6;
    }
    .btn-container {
      text-align: center;
      margin: 35px 0 15px 0;
    }
    .btn {
      display: inline-block;
      background-color: #fafafa;
      color: #18181b;
      font-weight: 800;
      font-size: 13px;
      text-decoration: none;
      padding: 12px 28px;
      border: 1px solid #fafafa;
      transition: all 0.2s ease;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="eyebrow">${emailContent.title}</span>
        <h1 class="title">${escapedCourseName}</h1>
        <div class="subtitle">${emailContent.subtitle}</div>
      </div>
      
      <p class="greeting">
        ${emailContent.hello}<br><br>
        ${emailContent.intro}
      </p>

      <div class="grid">
        <div class="grid-col">
          <p class="metric-value">${scoreText}</p>
          <p class="metric-label">${emailContent.avgScore}</p>
        </div>
        <div class="grid-col">
          <p class="metric-value">${progressText}</p>
          <p class="metric-label">${emailContent.modulesDone}</p>
        </div>
        <div class="grid-col">
          <p class="metric-value">${quizText}</p>
          <p class="metric-label">${emailContent.quizPractice}</p>
        </div>
      </div>

      <div class="btn-container">
        <a href="${learnerDashboardHref}" class="btn">
          ${emailContent.cta}
        </a>
      </div>

      <div class="footer">
        ${emailContent.footer}
      </div>
    </div>
  </div>
</body>
</html>
      `;

      // 6. Send the email
      const mailResult = await sendWorkspaceEmail(wsId, {
        recipients: { to: [profile.email] },
        content: {
          subject: emailContent.subject,
          html: emailHtml,
        },
      });

      if (!mailResult.success) {
        console.error(
          'Failed to send performance report email:',
          mailResult.error
        );
        return NextResponse.json(
          { message: 'Failed to deliver report email' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    } catch (error) {
      console.error('Failed to process student email report:', error);
      return NextResponse.json(
        { message: 'Failed to process email report' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 20, windowMs: 60000 },
  }
);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}
