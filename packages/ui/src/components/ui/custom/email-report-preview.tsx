import type { ReactNode } from 'react';

export default function EmailReportPreview({
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
  t: any;

  parseDynamicText: (text?: string | null) => ReactNode;

  getConfig: (id: string) => string | null | undefined;
}) {
  return (
    <div className="report-container">
      <div className="report-content">
        <div className="report-header">
          {getConfig('BRAND_LOGO_URL') && (
            <img
              src={getConfig('BRAND_LOGO_URL')!}
              alt="logo"
              style={{ maxWidth: '200px', height: 'auto' }}
            />
          )}

          <div className="brand-info">
            {getConfig('BRAND_NAME') && (
              <div className="brand-name">{getConfig('BRAND_NAME')}</div>
            )}

            {getConfig('BRAND_LOCATION') && (
              <div className="brand-location">
                {getConfig('BRAND_LOCATION')}
              </div>
            )}

            {getConfig('BRAND_PHONE_NUMBER') && (
              <div className="brand-phone">
                {getConfig('BRAND_PHONE_NUMBER')}
              </div>
            )}
          </div>
        </div>

        {(!!getConfig('BRAND_NAME') ||
          !!getConfig('BRAND_LOCATION') ||
          !!getConfig('BRAND_PHONE_NUMBER')) && (
          <div className="separator"></div>
        )}

        <div className="report-title">
          {data?.title}
          {getConfig('REPORT_TITLE_PREFIX')} {getConfig('REPORT_TITLE_SUFFIX')}
        </div>

        {getConfig('REPORT_INTRO') && (
          <div className="report-intro">
            {parseDynamicText(getConfig('REPORT_INTRO'))}
          </div>
        )}

        {(!!getConfig('REPORT_CONTENT_TEXT') ||
          !!getConfig('REPORT_SCORE_TEXT') ||
          !!getConfig('REPORT_FEEDBACK_TEXT')) && (
          <div className="report-sections">
            {getConfig('REPORT_CONTENT_TEXT') && (
              <div className="report-section-content">
                <div className="report-section-header">
                  {getConfig('REPORT_CONTENT_TEXT')}
                </div>
                <div
                  className={`report-section-body ${
                    !data?.content ? 'content-body-center' : 'content-body'
                  }`}
                >
                  <span className={!data?.content ? 'text-empty' : ''}>
                    {data?.content || t('common.empty')}
                  </span>
                </div>
              </div>
            )}

            {getConfig('REPORT_SCORE_TEXT') && (
              <div
                className={`report-section ${getConfig('REPORT_CONTENT_TEXT') ? 'report-section-left-border' : ''}`}
              >
                <div className="report-section-header">
                  {getConfig('REPORT_SCORE_TEXT')}
                </div>
                <div className="report-section-body score-body">
                  <span className={data?.score ? 'score-value' : 'score-empty'}>
                    {data?.score || '-'}
                  </span>
                </div>
              </div>
            )}

            {getConfig('REPORT_FEEDBACK_TEXT') && (
              <div
                className={`report-section-content ${getConfig('REPORT_CONTENT_TEXT') || getConfig('REPORT_SCORE_TEXT') ? 'report-section-left-border' : ''}`}
              >
                <div className="report-section-header">
                  {getConfig('REPORT_FEEDBACK_TEXT')}
                </div>
                <div
                  className={`report-section-body ${
                    !data?.feedback ? 'feedback-body-center' : 'feedback-body'
                  }`}
                >
                  <span className={!data?.feedback ? 'text-empty' : ''}>
                    {data?.feedback || t('common.empty')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="report-footer">
          {getConfig('REPORT_CONCLUSION')}

          {getConfig('REPORT_CONCLUSION') && getConfig('REPORT_CLOSING') && (
            <>
              <br />
              <br />
            </>
          )}

          {getConfig('REPORT_CLOSING') && (
            <span className="report-closing">
              {getConfig('REPORT_CLOSING')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
