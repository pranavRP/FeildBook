import { requireViewer } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { CommandSearch } from "@/components/shell/command-search";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { LogoMark } from "@/components/logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const name = viewer.profile.full_name || viewer.email.split("@")[0];

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={viewer.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:px-8">
          <LogoMark className="lg:hidden" />
          <div className="min-w-0 flex-1">
            <CommandSearch />
          </div>
          <ThemeToggle />
          <UserMenu name={name} email={viewer.email} role={viewer.role} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav role={viewer.role} />
    </div>
  );
}
