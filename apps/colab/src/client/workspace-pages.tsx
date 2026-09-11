import { useCopy } from './i18n';
import { Learning } from './learning';
import { WorkshopsPage } from './workshops-page';

export function WorkspacePages(props: { canHost: boolean }) {
  const c = useCopy();
  const w = c.workspace;
  const path = location.pathname;
  if (path === '/guide')
    return (
      <div className="home workspace-guide">
        <div className="lobby-heading">
          <div>
            <h1>{c.practiceGuide}</h1>
            <p>{w.guideDescription}</p>
          </div>
        </div>
        <Learning />
      </div>
    );
  return <WorkshopsPage canHost={props.canHost} />;
}
