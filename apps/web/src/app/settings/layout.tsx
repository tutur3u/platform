interface LayoutProps {
  params: {
    hideNavbar?: boolean;
    hideFooter?: boolean;
  };
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex justify-center p-4 md:p-8 lg:p-16 xl:px-32">
      {children}
    </div>
  );
}
