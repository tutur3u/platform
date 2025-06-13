import Projects from './projects';

export default function ProjectsPage() {
  return (
    <div className="flex justify-center">
      <div className="container flex flex-col items-center gap-6 text-foreground">
        <Projects />
      </div>
    </div>
  );
}
