// import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata = {
  title: "Rewise",
  description:
    "Brainstorm and organize your ideas at the speed of thought, supercharged by AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <main className="min-h-screen bg-background flex flex-col items-center">
          {children}
        </main>
        {/* <Toaster /> */}
      </body>
    </html>
  );
}
