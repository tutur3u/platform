import MainProject from './main-project';
import Projects from './projects';

export default function ProjectsPage() {
  return (
    <div className="container flex flex-col items-center gap-6 text-foreground">
      <MainProject />
      <Projects />
    </div>
  );
}
