'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { useState } from 'react';

type CronJob = {
  id: number;
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: 'success' | 'failed' | 'pending';
};

type CronExecution = {
  id: number;
  jobId: number;
  executionTime: string;
  status: 'success' | 'failed';
};

const initialCronJobs: CronJob[] = [
  {
    id: 1,
    name: 'Daily Price Update',
    schedule: '0 0 * * *',
    lastRun: '2023-06-20 00:00',
    nextRun: '2023-06-21 00:00',
    status: 'success',
  },
  {
    id: 2,
    name: 'Weekly Market Analysis',
    schedule: '0 0 * * 1',
    lastRun: '2023-06-19 00:00',
    nextRun: '2023-06-26 00:00',
    status: 'pending',
  },
  {
    id: 3,
    name: 'Monthly Report Generation',
    schedule: '0 0 1 * *',
    lastRun: '2023-06-01 00:00',
    nextRun: '2023-07-01 00:00',
    status: 'failed',
  },
];

export const CronJobs = () => {
  const [cronJobs] = useState<CronJob[]>(initialCronJobs);

  const translations = {
    en: {
      cronJobs: 'Cron Jobs',
      jobSetups: 'Job Setups',
      pastExecutions: 'Past Executions',
      name: 'Name',
      schedule: 'Schedule',
      lastRun: 'Last Run',
      nextRun: 'Next Run',
      status: 'Status',
      actions: 'Actions',
      executionTime: 'Execution Time',
      addJob: 'Add Job',
      jobName: 'Job Name',
      jobSchedule: 'Job Schedule (cron format)',
      success: 'Success',
      failed: 'Failed',
      pending: 'Pending',
      edit: 'Edit',
      delete: 'Delete',
    },
    vi: {
      cronJobs: 'Công việc định kỳ',
      jobSetups: 'Thiết lập công việc',
      pastExecutions: 'Lịch sử thực thi',
      name: 'Tên',
      schedule: 'Lịch trình',
      lastRun: 'Lần chạy cuối',
      nextRun: 'Lần chạy tiếp theo',
      status: 'Trạng thái',
      actions: 'Hành động',
      executionTime: 'Thời gian thực thi',
      addJob: 'Thêm công việc',
      jobName: 'Tên công việc',
      jobSchedule: 'Lịch trình công việc (định dạng cron)',
      success: 'Thành công',
      failed: 'Thất bại',
      pending: 'Đang chờ',
      edit: 'Sửa',
      delete: 'Xóa',
    },
  };

  const t = translations['en'];

  const getStatusIcon = (
    status: CronJob['status'] | CronExecution['status']
  ) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const content = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.name}</TableHead>
          <TableHead>{t.schedule}</TableHead>
          <TableHead>{t.lastRun}</TableHead>
          <TableHead>{t.nextRun}</TableHead>
          <TableHead>{t.status}</TableHead>
          <TableHead>{t.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cronJobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>{job.name}</TableCell>
            <TableCell>{job.schedule}</TableCell>
            <TableCell>{job.lastRun}</TableCell>
            <TableCell>{job.nextRun}</TableCell>
            <TableCell>
              <div className="flex items-center">
                {getStatusIcon(job.status)}
                <span className="ml-2">{t[job.status]}</span>
              </div>
            </TableCell>
            <TableCell>
              <Button variant="outline" size="sm" className="mr-2">
                {t.edit}
              </Button>
              <Button variant="destructive" size="sm">
                {t.delete}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return content;
};
