import { SideNav } from "./side-nav";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen justify-center p-6 md:p-12">
      <div className="flex w-full max-w-6xl flex-col gap-8 md:flex-row">
        <aside className="w-full flex-shrink-0 md:w-48 lg:w-64">
          <div className="sticky top-12">
            <SideNav />
          </div>
        </aside>
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
