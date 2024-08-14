import {
  Body,
  Head,
  Html,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface UserGroupPost {
  id: string;
  groupid: string;
  title: string;
  content: string;
  notes: string;
  created_at: string;
}

const Email = () => {
  const reportData: UserGroupPost = {
    id: '1',
    groupid: 'grp-001',
    title: 'Monthly Performance Report',
    content: 'This is the detailed content of the report for the group...',
    notes: 'These are additional notes about the performance.',
    created_at: '2024-08-14T06:27:02.264969+00:00',
  };

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body>
          <Section className="mb-6 flex justify-between">
            <Section className="flex flex-col">
              <Text className="text-lg font-bold">
                EASY APPLIED LANGUAGE CENTER
              </Text>
              <Text className="ml-[30px] text-sm">
                24 Trường Sa - Phước Long - Nha Trang
              </Text>
              <Text className="ml-[50px] text-sm">
                (0258) 6 557 457 — 0977 183 161
              </Text>
            </Section>
            <Section></Section>
          </Section>

          <Section className="mb-6 text-center">
            <Text className="text-xl font-bold uppercase">Class Content</Text>
          </Section>

          <Text>Title: {reportData.title}</Text>
          <Text>Content: {reportData.content}</Text>
          <Text>Notes: {reportData.notes}</Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default Email;
