import type {
  FeeLockSnapshot,
  FeeLockStatus,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';

// Rows for the fee-lock Excel export (design §2.4). Decision "Trà 15:12 Q1":
// ONE summary row per student per period, covering all their classes and the
// extras staff added; the "Chi tiết" sheet lists every line. No phone, email,
// parent or address fields. Text is plain; the workbook writer guards it.

type ExportLine = Omit<FeeLockSnapshot['lines'][number], 'product_id'>;

/** A locked revision snapshot, or a draft mapped into the same shape. */
export interface FeeLockExportEntry {
  status: FeeLockStatus;
  /** The exported locked revision; null for drafts. */
  revision: number | null;
  student_name: string;
  period_month: string;
  currency: string;
  total_amount: number;
  lines: readonly ExportLine[];
  /** Rendered notice text for the "Nội dung thông báo" column (locked only). */
  notice?: string | null;
}

export type FeeLockExportLocale = 'vi' | 'en';
export type FeeLockExportCell = string | number | null;

// biome-ignore format: dense header rows keep the agreed columns reviewable
const COPY = {
  vi: {
    summary: 'Tổng hợp',
    detail: 'Chi tiết',
    locked: 'Đã chốt',
    draft: 'Bản nháp',
    tuition: 'Học phí',
    extra: 'Khoản thêm',
    notice: 'Nội dung thông báo',
    summaryHeader: [
      'STT', 'Học viên', 'Lớp', 'Tháng', 'Số buổi', 'Học phí', 'Điều chỉnh', 'Lý do',
      'Khoản thêm', 'Tiền khoản thêm', 'Tổng', 'Trạng thái', 'Phiên bản',
    ],
    detailHeader: [
      'STT', 'Học viên', 'Tháng', 'Loại', 'Lớp', 'Nội dung', 'Đơn vị', 'Đơn giá',
      'Số lượng', 'Điều chỉnh', 'Lý do', 'Thành tiền', 'Trạng thái', 'Phiên bản',
    ],
  },
  en: {
    summary: 'Summary',
    detail: 'Details',
    locked: 'Locked',
    draft: 'Draft',
    tuition: 'Tuition',
    extra: 'Extra item',
    notice: 'Notice text',
    summaryHeader: [
      'No.', 'Student', 'Classes', 'Month', 'Sessions', 'Tuition', 'Adjustment', 'Reason',
      'Extra items', 'Extra items amount', 'Total', 'Status', 'Revision',
    ],
    detailHeader: [
      'No.', 'Student', 'Month', 'Kind', 'Class', 'Item', 'Unit', 'Unit price',
      'Quantity', 'Adjustment', 'Reason', 'Amount', 'Status', 'Revision',
    ],
  },
} as const;

export interface FeeLockExportSheets {
  summaryName: string;
  detailName: string;
  summary: FeeLockExportCell[][];
  detail: FeeLockExportCell[][];
}

const sum = (lines: readonly ExportLine[], pick: (l: ExportLine) => number) =>
  lines.reduce((total, line) => total + pick(line), 0);

/** `YYYY-MM-01` → `MM/YYYY`, as staff write months. */
export function formatExportMonth(periodMonth: string) {
  const [year = '', month = ''] = periodMonth.split('-');
  return `${month}/${year}`;
}

export function buildFeeLockExportSheets(
  entries: readonly FeeLockExportEntry[],
  locale: FeeLockExportLocale = 'vi',
  includeNotice = false
): FeeLockExportSheets {
  const copy = COPY[locale];
  const summary: FeeLockExportCell[][] = [
    [...copy.summaryHeader, ...(includeNotice ? [copy.notice] : [])],
  ];
  const detail: FeeLockExportCell[][] = [[...copy.detailHeader]];

  entries.forEach((entry, index) => {
    const no = index + 1;
    const month = formatExportMonth(entry.period_month);
    const status = entry.status === 'locked' ? copy.locked : copy.draft;
    const lines = [...entry.lines].sort((a, b) => a.sort_order - b.sort_order);
    const tuition = lines.filter((line) => line.kind === 'tuition');
    const extras = lines.filter((line) => line.kind === 'extra');
    const several = tuition.length > 1;
    const reasons = tuition.flatMap((line) => {
      const reason = line.reason?.trim();
      if (!reason) return [];
      return [several ? `${line.group_name ?? ''}: ${reason}` : reason];
    });

    summary.push([
      no,
      entry.student_name,
      tuition.map((line) => line.group_name ?? '').join(', '),
      month,
      sum(tuition, (line) => line.quantity),
      sum(tuition, (line) => line.line_amount - line.adjustment_amount),
      sum(tuition, (line) => line.adjustment_amount),
      reasons.join('; '),
      extras
        .map((line) =>
          `${line.label} × ${line.quantity} ${line.unit_label ?? ''}`.trim()
        )
        .join('; '),
      sum(extras, (line) => line.line_amount),
      entry.total_amount,
      status,
      entry.revision,
      ...(includeNotice ? [entry.notice ?? null] : []),
    ]);

    for (const line of lines) {
      detail.push([
        no,
        entry.student_name,
        month,
        line.kind === 'tuition' ? copy.tuition : copy.extra,
        line.group_name,
        line.label,
        line.unit_label,
        line.unit_price,
        line.quantity,
        line.adjustment_amount,
        line.reason,
        line.line_amount,
        status,
        entry.revision,
      ]);
    }
  });

  return {
    summaryName: copy.summary,
    detailName: copy.detail,
    summary,
    detail,
  };
}
