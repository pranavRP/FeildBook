import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark />
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Button asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </main>
  );
}
