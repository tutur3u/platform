'use client';

import AllAvailabilities from './all-availabilities';
import EditPlanDialog from './edit-plan-dialog';
import PlanLogin from './plan-login';
import PlanUserFilter from './plan-user-filter';
import UtilityButtons from './utility-buttons';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import { Separator } from '@tuturuuu/ui/separator';
import html2canvas from 'html2canvas-pro';
import { useTheme } from 'next-themes';
import { useCallback } from 'react';

interface PlanDetailsClientProps {
  plan: MeetTogetherPlan;
  platformUser: User | null;
  users: {
    id: string | null;
    display_name: string | null;
    is_guest: boolean | null;
    timeblock_count: number | null;
  }[];
  timeblocks: {
    is_guest: boolean;
    created_at: string;
    date: string;
    end_time: string;
    id: string;
    plan_id: string;
    start_time: string;
    user_id: string;
  }[];
}

export default function PlanDetailsClient({
  plan,
  platformUser,
  users,
  timeblocks,
}: PlanDetailsClientProps) {
  const { resolvedTheme } = useTheme();

  const downloadAsPNG = useCallback(async () => {
    const element = document.getElementById('plan-ref');
    if (!element) throw new Error('Plan element not found');

    const backgroundColor = resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff';
    const logoSrc =
      resolvedTheme === 'dark'
        ? '/media/official-logos/light-logo.png'
        : '/media/official-logos/dark-logo.png';

    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        backgroundColor,
        scale: 1,
        logging: false,
        onclone: (clonedDoc: Document) => {
          Array.from(clonedDoc.getElementsByTagName('link')).forEach(
            (link: HTMLLinkElement) => {
              link.removeAttribute('integrity');
              link.removeAttribute('crossorigin');
            }
          );
        },
      });

      const ctx = canvas.getContext('2d');
      const logo = new window.Image();
      logo.crossOrigin = 'anonymous';
      logo.src = logoSrc;
      logo.onload = () => {
        if (ctx) {
          const logoWidth = 60;
          const logoHeight = 60;
          const logoPosition:
            | 'center'
            | 'top-left'
            | 'top-right'
            | 'bottom-left'
            | 'bottom-right' = 'bottom-right';
          const margin = 32;
          let x = 0;
          let y = 0;
          switch (logoPosition) {
            case 'center':
              x = (canvas.width - logoWidth) / 2;
              y = (canvas.height - logoHeight) / 2;
              break;
            case 'top-left':
              x = margin;
              y = margin;
              break;
            case 'top-right':
              x = canvas.width - logoWidth - margin;
              y = margin;
              break;
            case 'bottom-left':
              x = margin;
              y = canvas.height - logoHeight - margin;
              break;
            case 'bottom-right':
              x = canvas.width - logoWidth - margin;
              y = canvas.height - logoHeight - margin;
              break;
            default:
              x = (canvas.width - logoWidth) / 2;
              y = (canvas.height - logoHeight) / 2;
          }
          ctx.drawImage(logo, x, y, logoWidth, logoHeight);
        }
        const link = document.createElement('a');
        link.download = `plan-${plan.id}.png`;
        link.href = canvas.toDataURL('image/png', 2.0);
        link.click();
      };
      logo.onerror = (e) => {
        console.error('Logo failed to load:', logoSrc, e);
        alert('Logo failed to load! Check the path and file type.');
        const link = document.createElement('a');
        link.download = `plan-${plan.id}.png`;
        link.href = canvas.toDataURL('image/png', 2.0);
        link.click();
      };
    } catch (error) {
      console.error('Error generating PNG:', error);
      throw error;
    }
  }, [plan.id, resolvedTheme]);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6 p-4 text-foreground md:px-8 lg:gap-14 lg:px-14">
      <div className="flex w-full flex-col items-center">
        <UtilityButtons
          plan={plan}
          platformUser={platformUser}
          handlePNG={downloadAsPNG}
        />
        <div id="plan-ref" className="flex w-full flex-col items-center">
          <p className="my-4 flex max-w-xl items-center gap-2 text-center text-2xl leading-tight! font-semibold md:mb-4 lg:text-3xl">
            {plan.name} <EditPlanDialog plan={plan} />
          </p>
          <div className="mt-8 grid w-full items-center justify-between gap-4 md:grid-cols-2">
            <PlanLogin
              plan={plan}
              timeblocks={[]}
              platformUser={platformUser}
            />
            <AllAvailabilities plan={plan} timeblocks={timeblocks} />
          </div>
        </div>
      </div>
      {users.length > 0 && (
        <>
          <Separator className="mt-8" />
          <PlanUserFilter users={users} />
        </>
      )}
    </div>
  );
}
