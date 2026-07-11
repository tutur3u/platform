'use client';

import { useQuery } from '@tanstack/react-query';
import { getTulearnCourse } from '@tuturuuu/internal-api';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LearnerVocabulary } from '@/components/learner-pages/learner-vocabulary';

interface Props {
  courseId: string;
  wsId: string;
}

function findVisibleModuleId(modules: Array<{ id: string }>) {
  const moduleIds = new Set(modules.map((module) => module.id));
  const detail = document.querySelector<HTMLElement>(
    '[data-learn-module-detail-id]'
  );
  const moduleId = detail?.dataset.learnModuleDetailId;

  return moduleId && moduleIds.has(moduleId) ? moduleId : null;
}

function findModuleTabsContainer() {
  return document.querySelector<HTMLElement>('[data-learn-module-tabs]');
}

function ensureVocabularyPanelHost(tabContainer: HTMLElement) {
  const existing = tabContainer.parentElement?.querySelector<HTMLElement>(
    '[data-learn-vocabulary-panel-host]'
  );

  if (existing) return existing;

  const host = document.createElement('div');
  host.dataset.learnVocabularyPanelHost = 'true';
  host.style.display = 'none';
  tabContainer.insertAdjacentElement('afterend', host);
  return host;
}

export default function CourseVocabularyShell({
  children,
  courseId,
  wsId,
}: PropsWithChildren<Props>) {
  const t = useTranslations('vocabulary');
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isVocabularyTabActive, setIsVocabularyTabActive] = useState(false);
  const [tabContainer, setTabContainer] = useState<HTMLElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);

  const course = useQuery({
    queryFn: () => getTulearnCourse(wsId, courseId, studentId),
    queryKey: ['learn-vocabulary-course', wsId, studentId, courseId],
  });

  const modules = useMemo(
    () =>
      (course.data?.modules ?? []).map((module) => ({
        id: module.id,
        name: module.name,
      })),
    [course.data?.modules]
  );

  useEffect(() => {
    if (modules.length === 0) {
      setActiveModuleId(null);
      return;
    }

    function syncActiveModule() {
      const isModuleDetailOpen = Boolean(
        document.querySelector('[data-learn-module-back]')
      );

      setActiveModuleId(
        isModuleDetailOpen ? findVisibleModuleId(modules) : null
      );

      if (!isModuleDetailOpen) {
        setIsVocabularyTabActive(false);
        setTabContainer(null);
        setPanelHost(null);
        return;
      }

      const nextTabContainer = findModuleTabsContainer();
      setTabContainer(nextTabContainer);
      setPanelHost(
        nextTabContainer ? ensureVocabularyPanelHost(nextTabContainer) : null
      );
    }

    syncActiveModule();

    const observer = new MutationObserver(syncActiveModule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [modules]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-learn-module-tab]'
      );

      if (tab?.dataset.learnModuleTab) {
        setIsVocabularyTabActive(false);
      }
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!panelHost || !tabContainer?.parentElement) return;

    const siblings = Array.from(tabContainer.parentElement.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== tabContainer
    );

    for (const sibling of siblings) {
      if (sibling === panelHost) {
        sibling.style.display = isVocabularyTabActive ? '' : 'none';
      } else if (isVocabularyTabActive) {
        sibling.dataset.learnVocabularyPreviousDisplay = sibling.style.display;
        sibling.style.display = 'none';
      } else if ('learnVocabularyPreviousDisplay' in sibling.dataset) {
        sibling.style.display =
          sibling.dataset.learnVocabularyPreviousDisplay ?? '';
        delete sibling.dataset.learnVocabularyPreviousDisplay;
      }
    }

    return () => {
      for (const sibling of siblings) {
        if (sibling === panelHost) {
          sibling.style.display = 'none';
        } else if ('learnVocabularyPreviousDisplay' in sibling.dataset) {
          sibling.style.display =
            sibling.dataset.learnVocabularyPreviousDisplay ?? '';
          delete sibling.dataset.learnVocabularyPreviousDisplay;
        }
      }
    };
  }, [isVocabularyTabActive, panelHost, tabContainer]);

  return (
    <>
      {children}

      {activeModuleId && tabContainer
        ? createPortal(
            <button
              className={`cursor-pointer border-2 border-border px-4 py-2 font-black text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] ${
                isVocabularyTabActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground'
              }`}
              onClick={() => setIsVocabularyTabActive(true)}
              type="button"
            >
              {t('tab')}
            </button>,
            tabContainer
          )
        : null}

      {activeModuleId && panelHost
        ? createPortal(
            <LearnerVocabulary
              key={activeModuleId}
              moduleId={activeModuleId}
            />,
            panelHost
          )
        : null}
    </>
  );
}
