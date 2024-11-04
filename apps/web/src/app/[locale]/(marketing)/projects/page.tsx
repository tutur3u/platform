import Projects from './projects';

export default function ProjectsPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground container flex flex-col items-center gap-6">
        <Projects />
      </div>
    </div>
  );
}
