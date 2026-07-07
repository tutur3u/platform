import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';
import { createBatch } from '@tuturuuu/email-service';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

export const POST = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
  ) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          { message: 'Invalid route params', errors: parsedParams.error.issues },
          { status: 400 }
        );
      }

      const { wsId, courseId } = parsedParams.data;

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
        return NextResponse.json({ message: 'Course not found' }, { status: 404 });
      }

      // 2. Fetch all student profiles
      const { data: members } = await access.sbAdmin
        .from('workspace_user_groups_users')
        .select(
          `user_id,
           role,
           profile:workspace_users!workspace_user_roles_users_user_id_fkey(id, display_name, full_name, email)`
        )
        .eq('group_id', courseId);

      if (!members || members.length === 0) {
        return NextResponse.json({
          message: 'No students enrolled',
          sentCount: 0,
          failedCount: 0,
        });
      }

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

      // 4. Get all student submissions
      const { data: submissions } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quiz_submissions')
            .select('user_id, module_id, is_correct, created_at')
            .in('module_id', moduleIds)
        : { data: [] };

      // Get user links to map platform_user_id to virtual_user_id
      const { data: userLinks } = await access.sbAdmin
        .from('workspace_user_linked_users')
        .select('platform_user_id, virtual_user_id')
        .eq('ws_id', normalizedWsId);

      const platformToVirtual = new Map<string, string>();
      const virtualToPlatform = new Map<string, string>();
      for (const link of userLinks ?? []) {
        platformToVirtual.set(link.platform_user_id, link.virtual_user_id);
        virtualToPlatform.set(link.virtual_user_id, link.platform_user_id);
      }

      // Group submissions by virtual user ID
      type SubRow = {
        user_id: string;
        module_id: string;
        is_correct: boolean | null;
        created_at: string;
      };

      const subsByUser: Record<string, SubRow[]> = {};
      for (const sub of (submissions ?? []) as SubRow[]) {
        const virtualId = platformToVirtual.get(sub.user_id) ?? sub.user_id;
        if (!subsByUser[virtualId]) subsByUser[virtualId] = [];
        subsByUser[virtualId]!.push(sub);
      }

      // 5. Initialize email batch
      const batch = createBatch(wsId, { concurrency: 5 });
      let queuedCount = 0;

      for (const member of members) {
        const profile = (
          Array.isArray(member.profile) ? member.profile[0] : member.profile
        ) as {
          id: string;
          display_name: string | null;
          full_name: string | null;
          email: string | null;
        } | null;

        if (!profile || !profile.email) continue;

        // Calculate stats for this student
        const subs = subsByUser[member.user_id] ?? [];
        const answeredCount = subs.length;
        const correctCount = subs.filter((s) => s.is_correct === true).length;
        const pendingGradingCount = subs.filter((s) => s.is_correct === null).length;

        const gradedCount = answeredCount - pendingGradingCount;
        const scorePercent =
          gradedCount > 0 ? Math.round((correctCount / gradedCount) * 100) : null;

        const modulesWithSubs = new Set(subs.map((s) => s.module_id));
        const completedModules = moduleIds.filter((mid) => modulesWithSubs.has(mid)).length;

        // Render HTML
        const studentName = profile.display_name ?? profile.full_name ?? 'Học sinh';
        
        const emailContent = {
          subject: `[Tuturuuu] Báo cáo học tập - ${course.name}`,
          title: 'Báo cáo học tập',
          subtitle: 'Tóm tắt tiến trình học tập cá nhân',
          hello: `Xin chào <strong>${studentName}</strong>,`,
          intro: `Dưới đây là báo cáo kết quả học tập hiện tại của bạn cho khóa học <strong>${course.name}</strong>. Hãy tiếp tục luyện tập và hoàn thành các bài học nhé!`,
          avgScore: 'Điểm trung bình',
          modulesDone: 'Module đã xong',
          quizPractice: 'Luyện tập quiz',
          cta: 'Đi tới bảng điều khiển học viên',
          footer: `Báo cáo học tập được gửi tự động từ giảng viên của bạn.<br>Hệ thống giáo dục Tuturuuu &copy; 2026`,
          pending: 'Đang chờ',
          modulesUnit: 'module',
          answeredUnit: 'câu',
        };

        const scoreText = scorePercent !== null ? `${scorePercent}%` : emailContent.pending;
        const progressText = `${completedModules}/${totalModules} ${emailContent.modulesUnit}`;
        const quizText = `${answeredCount}/${totalQuizzes ?? 0} ${emailContent.answeredUnit}`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${emailContent.subject}</title>
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
        <h1 class="title">${course.name}</h1>
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
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.localhost'}/${wsId}" class="btn">
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

        batch.add({
          to: profile.email,
          subject: emailContent.subject,
          html: emailHtml,
        });
        queuedCount++;
      }

      if (queuedCount === 0) {
        return NextResponse.json({
          message: 'No student emails to send',
          sentCount: 0,
          failedCount: 0,
        });
      }

      // 6. Execute batch send
      const results = await batch.send();

      return NextResponse.json({
        message: 'success',
        sentCount: results.sent,
        failedCount: results.failed,
      });
    } catch (error) {
      console.error('Failed to process bulk student email report:', error);
      return NextResponse.json(
        { message: 'Failed to process bulk email reports' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 10, windowMs: 60000 },
  }
);
