interface BreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ currentPath, onNavigate }: BreadcrumbProps) {
  const pathSegments = currentPath
    ? currentPath.split('/').filter(Boolean)
    : [];

  return (
    <div className="mb-4 flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => onNavigate('')}
        className="text-blue-600 transition-colors hover:text-blue-800 hover:underline"
      >
        Root
      </button>
      {pathSegments.map((segment, index) => {
        const path = pathSegments.slice(0, index + 1).join('/');
        const isLast = index === pathSegments.length - 1;

        return (
          <div key={path} className="flex items-center gap-2">
            <span className="text-gray-400">/</span>
            {isLast ? (
              <span className="font-medium text-gray-900">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(path)}
                className="text-blue-600 transition-colors hover:text-blue-800 hover:underline"
              >
                {segment}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
