import Image from 'next/image';
import type { ReactNode } from 'react';
import { Separator } from '../separator';

export default function ReportPreview({
  t,
  lang,
  data,
  parseDynamicText,
  getConfig,
}: {
  lang: string;
  data?: {
    title: string;
    content: string;
    score: string;
    feedback: string;
  };
  t: (key: string) => string;
  // eslint-disable-next-line no-unused-vars
  parseDynamicText: (text?: string | null) => ReactNode;
  // eslint-disable-next-line no-unused-vars
  getConfig: (id: string) => string | null | undefined;
}) {
  return (
    <div className="overflow-x-auto xl:flex-none">
      <div
        id={useId()}
        className="h-fit w-full flex-none rounded-xl dark:bg-foreground/10 print:p-4"
      >
        <div className="h-full rounded-lg border p-4 text-foreground md:p-12">
          <div className="flex flex-wrap items-center justify-between gap-8">
            {getConfig('BRAND_LOGO_URL') && (
              <Image
                src={getConfig('BRAND_LOGO_URL')}
                alt="logo"
                width={100}
                height={100}
                // onLoad={() => setIsLogoLoaded(true)}
              />
            )}

            <div className="text-center">
              {getConfig('BRAND_NAME') && (
                <div className="text-center text-lg font-bold">
                  {getConfig('BRAND_NAME')}
                </div>
              )}

              {getConfig('BRAND_LOCATION') && (
                <div className="text-center font-semibold">
                  {getConfig('BRAND_LOCATION')}
                </div>
              )}

              {getConfig('BRAND_PHONE_NUMBER') && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-semibold break-keep print:gap-2">
                  {getConfig('BRAND_PHONE_NUMBER')}
                </div>
              )}
            </div>
          </div>

          {(!!getConfig('BRAND_NAME') ||
            !!getConfig('BRAND_LOCATION') ||
            !!getConfig('BRAND_PHONE_NUMBER')) && (
            <Separator className="my-4" />
          )}

          <div className="text-center text-lg font-bold text-foreground uppercase">
            {getConfig('REPORT_TITLE_PREFIX')}{' '}
            {new Date().toLocaleDateString(lang, {
              month: 'long',
            })}
            /
            {new Date().toLocaleDateString(lang, {
              year: 'numeric',
            })}{' '}
            {getConfig('REPORT_TITLE_SUFFIX')}
          </div>

          {getConfig('REPORT_INTRO') && (
            <div className="mt-2 text-left text-sm whitespace-pre-wrap">
              {parseDynamicText(getConfig('REPORT_INTRO'))}
            </div>
          )}

          {(!!getConfig('REPORT_CONTENT_TEXT') ||
            !!getConfig('REPORT_SCORE_TEXT') ||
            !!getConfig('REPORT_FEEDBACK_TEXT')) && (
            <div className="my-4 flex flex-col justify-stretch rounded border-2 border-foreground/50 text-sm md:flex-row">
              {getConfig('REPORT_CONTENT_TEXT') && (
                <div className="md:flex-2">
                  <div className="flex h-16 items-center justify-center p-2 text-center text-sm font-bold whitespace-pre-wrap">
                    {getConfig('REPORT_CONTENT_TEXT')}
                  </div>
                  <div
                    className={`min-h-24 border-t-2 border-foreground/50 p-2 font-semibold break-words text-ellipsis whitespace-pre-line ${
                      !data?.content ? 'text-center underline' : 'text-left'
                    }`}
                  >
                    <span className={data?.content ? '' : 'opacity-50'}>
                      {data?.content || t('common.empty')}
                    </span>
                  </div>
                </div>
              )}

              {getConfig('REPORT_CONTENT_TEXT') &&
                getConfig('REPORT_SCORE_TEXT') && (
                  <div className="h-[2px] min-h-full w-auto shrink-0 bg-foreground/50 md:h-auto md:w-[2px]" />
                )}

              {getConfig('REPORT_SCORE_TEXT') && (
                <div className="flex-1 border-foreground/50">
                  <div className="flex h-16 flex-col items-center justify-center p-2 text-sm font-bold whitespace-pre-wrap">
                    {getConfig('REPORT_SCORE_TEXT')}
                  </div>
                  <div className="flex min-h-24 justify-center border-t-2 border-foreground/50 p-2 text-center break-words text-ellipsis whitespace-pre-line">
                    <span
                      className={
                        data?.score
                          ? 'text-2xl font-bold text-red-600 underline dark:text-red-300'
                          : 'font-semibold opacity-50'
                      }
                    >
                      {data?.score || '-'}
                    </span>
                  </div>
                </div>
              )}

              {(getConfig('REPORT_SCORE_TEXT') ||
                getConfig('REPORT_CONTENT_TEXT')) &&
                getConfig('REPORT_FEEDBACK_TEXT') && (
                  <div className="h-[2px] min-h-full w-auto shrink-0 bg-foreground/50 md:h-auto md:w-[2px]" />
                )}

              {getConfig('REPORT_FEEDBACK_TEXT') && (
                <div className="flex-2">
                  <div className="flex h-16 items-center justify-center p-2 text-sm font-bold whitespace-pre-wrap">
                    {getConfig('REPORT_FEEDBACK_TEXT')}
                  </div>
                  <div
                    className={`min-h-24 border-t-2 border-foreground/50 p-2 font-semibold break-words text-ellipsis whitespace-pre-line ${
                      !data?.feedback ? 'text-center underline' : 'text-left'
                    }`}
                  >
                    <span className={data?.feedback ? '' : 'opacity-50'}>
                      {data?.feedback || t('common.empty')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-left text-sm">
            {getConfig('REPORT_CONCLUSION')}

            {getConfig('REPORT_CONCLUSION') && getConfig('REPORT_CLOSING') && (
              <>
                <br />
                <br />
              </>
            )}

            {getConfig('REPORT_CLOSING') && (
              <span className="font-semibold">
                {getConfig('REPORT_CLOSING')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
