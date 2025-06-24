'use client';

import { CheckCircle, Clock, XCircle } from '@tuturuuu/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
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

const initialCronExecutions: CronExecution[] = [
  { id: 1, jobId: 1, executionTime: '2023-06-20 00:00', status: 'success' },
  { id: 2, jobId: 2, executionTime: '2023-06-19 00:00', status: 'success' },
  { id: 3, jobId: 3, executionTime: '2023-06-01 00:00', status: 'failed' },
  { id: 4, jobId: 1, executionTime: '2023-06-19 00:00', status: 'success' },
  { id: 5, jobId: 1, executionTime: '2023-06-18 00:00', status: 'success' },
];

export const Executions = () => {
  const [cronJobs] = useState<CronJob[]>(initialCronJobs);
  const [cronExecutions] = useState<CronExecution[]>(initialCronExecutions);

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

  const t = translations.en;

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
          <TableHead>{t.executionTime}</TableHead>
          <TableHead>{t.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cronExecutions.map((execution) => {
          const job = cronJobs.find((job) => job.id === execution.jobId);
          return (
            <TableRow key={execution.id}>
              <TableCell>{job?.name}</TableCell>
              <TableCell>{execution.executionTime}</TableCell>
              <TableCell>
                <div className="flex items-center">
                  {getStatusIcon(execution.status)}
                  <span className="ml-2">{t[execution.status]}</span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return content;
};
