import { Divider } from '@mantine/core';
import DefaultHead from '../headers/DefaultHead';
import useTranslation from 'next-translate/useTranslation';

const LandingPage = () => {
  const { t, lang } = useTranslation('home');

  const headlineMain = t('headline-main');
  const headlineSecondary = t('headline-secondary');

  const descP1 = t('desc-p1');
  const descP2 = t('desc-p2');

  const tasks = t('tasks');
  const schedules = t('schedules');
  const finances = t('finances');
  const notes = t('notes');

  const and = t('common:and');

  const comingSoon = t('coming-soon');
  const featuresLead = t('features-lead');

  const taskManagement = t('task-management');
  const taskManagementDesc = t('task-management-desc');

  const scheduleManagement = t('schedule-management');
  const scheduleManagementDesc = t('schedule-management-desc');

  const financeManagement = t('finance-management');
  const financeManagementDesc = t('finance-management-desc');

  const noteManagement = t('note-management');
  const noteManagementDesc = t('note-management-desc');

  return (
    <>
      <DefaultHead />
      <div className="mx-4 mb-8 mt-24 md:mx-32 lg:mx-64">
        <section className="grid gap-8 2xl:grid-cols-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-200 xl:text-3xl">
              {headlineSecondary}
              <div
                className={`w-fit bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text font-bold text-transparent ${
                  lang === 'en'
                    ? 'py-0.5 text-4xl md:text-5xl xl:py-2 xl:text-6xl'
                    : 'py-0.5 text-3xl md:text-4xl xl:py-2 xl:text-5xl'
                }`}
              >
                {headlineMain}
              </div>
            </h1>

            <p className="mt-8 text-xl text-zinc-100/80 md:mt-4">
              {descP1}{' '}
              <span className="font-semibold text-blue-300 underline decoration-blue-400 underline-offset-4">
                {tasks}
              </span>
              ,{' '}
              <span className="font-semibold text-orange-300 underline decoration-orange-400 underline-offset-4">
                {schedules}
              </span>
              ,{' '}
              <span className="font-semibold text-green-300 underline decoration-green-400 underline-offset-4">
                {finances}
              </span>
              , {and}{' '}
              <span className="font-semibold text-red-300 underline decoration-red-400 underline-offset-4">
                {notes}
              </span>{' '}
              {descP2}
            </p>
          </div>

          <div className="group relative h-32 md:h-96">
            <div className="animate-tilt absolute -inset-1 rounded-xl bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 opacity-75 blur-lg transition duration-1000 group-hover:opacity-100"></div>
            <div className="relative flex h-32 w-full cursor-default items-center justify-center rounded-xl bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 md:h-96">
              <div className="bg-gradient-to-br from-indigo-200 via-red-200 to-yellow-100 bg-clip-text py-3 text-center text-4xl font-semibold text-transparent xl:text-6xl">
                {comingSoon}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 xl:mt-24">
          <div className="text-xl font-semibold text-zinc-300 xl:text-4xl">
            {featuresLead}
          </div>

          <div className="mt-8 grid gap-4 lg:gap-8 xl:grid-cols-2">
            <div className="rounded-lg bg-blue-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-blue-300 md:text-2xl">
                {taskManagement}
              </h2>

              <Divider
                className="mb-4 mt-2 border-blue-300/20"
                variant="dashed"
              />

              <p className="text-blue-300/80">{taskManagementDesc}</p>
            </div>

            <div className="rounded-lg bg-orange-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-orange-300 md:text-2xl">
                {scheduleManagement}
              </h2>

              <Divider
                className="mb-4 mt-2 border-orange-300/20"
                variant="dashed"
              />

              <p className="text-orange-300/80">{scheduleManagementDesc}</p>
            </div>

            <div className="rounded-lg bg-green-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-green-300 md:text-2xl">
                {financeManagement}
              </h2>

              <Divider
                className="mb-4 mt-2 border-green-300/20"
                variant="dashed"
              />

              <p className="text-green-300/80">{financeManagementDesc}</p>
            </div>

            <div className="rounded-lg bg-red-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-red-300 md:text-2xl">
                {noteManagement}
              </h2>

              <Divider
                className="mb-4 mt-2 border-red-300/20"
                variant="dashed"
              />

              <p className="text-red-300/80">{noteManagementDesc}</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
