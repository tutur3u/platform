import type { ReactNode } from 'react';
import { Separator } from '../separator';

export default function ReportPreview({
  t,
  lang,
  data,
  parseDynamicText,
  getConfig,
  theme,
}: {
  lang: string;
  data?: {
    title: string;
    content: string;
    score: string;
    feedback: string;
  };
  t: any;

  parseDynamicText: (text?: string | null) => ReactNode;

  getConfig: (id: string) => string | null | undefined;
  theme?: 'light' | 'dark';
}) {
  return (
    <div className="overflow-x-auto xl:flex-none">
      <div
        id="printable-area"
        className={`h-[297mm] w-[210mm] max-w-full flex-none rounded-xl ${theme === 'dark' ? 'bg-foreground/10' : 'bg-white'} print:h-auto print:p-4 mx-auto`}
      >
        <div className={`h-full rounded-lg border p-4 ${theme === 'dark' ? 'text-foreground' : 'text-black'} md:p-12`}>
          <div className="flex flex-wrap items-center justify-between gap-8">
            {getConfig('BRAND_LOGO_URL') && (
              <img
                src={getConfig('BRAND_LOGO_URL')!}
                alt="logo"
                // onLoad={() => setIsLogoLoaded(true)}
              />
            )}

            <div className="text-center">
              {getConfig('BRAND_NAME') && (
                <div className="text-center font-bold text-lg">
                  {getConfig('BRAND_NAME')}
                </div>
              )}

              {getConfig('BRAND_LOCATION') && (
                <div className="text-center font-semibold">
                  {getConfig('BRAND_LOCATION')}
                </div>
              )}

              {getConfig('BRAND_PHONE_NUMBER') && (
                <div className="flex flex-wrap items-center justify-center gap-2 break-keep text-center font-semibold text-sm print:gap-2">
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

          <div className={`text-center font-bold ${theme === 'dark' ? 'text-foreground' : 'text-black'} text-lg uppercase`}>
            {data?.title}
            {getConfig('REPORT_TITLE_PREFIX')}{' '}
            {/* {new Date().toLocaleDateString(lang, {
              month: 'long',
            })}
            /
            {new Date().toLocaleDateString(lang, {
              year: 'numeric',
            })}{' '} */}
            {getConfig('REPORT_TITLE_SUFFIX')}
          </div>

          {getConfig('REPORT_INTRO') && (
            <div className={`mt-2 whitespace-pre-wrap text-left text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
              {parseDynamicText(getConfig('REPORT_INTRO'))}
            </div>
          )}

          {(!!getConfig('REPORT_CONTENT_TEXT') ||
            !!getConfig('REPORT_SCORE_TEXT') ||
            !!getConfig('REPORT_FEEDBACK_TEXT')) && (
            <div className={`my-4 flex flex-col justify-stretch rounded border-2 ${theme === 'dark' ? 'border-foreground/50' : 'border-black/50'} text-sm md:flex-row`}>
              {getConfig('REPORT_CONTENT_TEXT') && (
                <div className="md:flex-2">
                  <div className={`flex h-16 items-center justify-center whitespace-pre-wrap p-2 text-center font-bold text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
                    {getConfig('REPORT_CONTENT_TEXT')}
                  </div>
                  <div
                    className={`min-h-24 text-ellipsis whitespace-pre-line break-words ${theme === 'dark' ? 'border-foreground/50' : 'border-black/50'} border-t-2 p-2 font-semibold ${
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
                  <div className={`h-[2px] min-h-full w-auto shrink-0 ${theme === 'dark' ? 'bg-foreground/50' : 'bg-black/50'} md:h-auto md:w-[2px]`} />
                )}

              {getConfig('REPORT_SCORE_TEXT') && (
                <div className={`flex-1 ${theme === 'dark' ? 'border-foreground/50' : 'border-black/50'}`}>
                  <div className={`flex h-16 flex-col items-center justify-center whitespace-pre-wrap p-2 font-bold text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
                    {getConfig('REPORT_SCORE_TEXT')}
                  </div>
                  <div className={`flex min-h-24 justify-center text-ellipsis whitespace-pre-line break-words ${theme === 'dark' ? 'border-foreground/50' : 'border-black/50'} border-t-2 p-2 text-center`}>
                    <span
                      className={
                        data?.score
                          ? `font-bold text-2xl underline ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`
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
                  <div className={`h-[2px] min-h-full w-auto shrink-0 ${theme === 'dark' ? 'bg-foreground/50' : 'bg-black/50'} md:h-auto md:w-[2px]`} />
                )}

              {getConfig('REPORT_FEEDBACK_TEXT') && (
                <div className="flex-2">
                  <div className={`flex h-16 items-center justify-center whitespace-pre-wrap p-2 font-bold text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
                    {getConfig('REPORT_FEEDBACK_TEXT')}
                  </div>
                  <div
                    className={`min-h-24 text-ellipsis whitespace-pre-line break-words ${theme === 'dark' ? 'border-foreground/50' : 'border-black/50'} border-t-2 p-2 font-semibold ${
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

          <div className={`text-left text-sm ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
            {getConfig('REPORT_CONCLUSION')}

            {getConfig('REPORT_CONCLUSION') && getConfig('REPORT_CLOSING') && (
              <>
                <br />
                <br />
              </>
            )}

            {getConfig('REPORT_CLOSING') && (
              <span className={`font-semibold ${theme === 'dark' ? 'text-foreground' : 'text-black'}`}>
                {getConfig('REPORT_CLOSING')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
