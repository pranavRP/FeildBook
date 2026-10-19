"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setUserActive } from "./actions";

export function ActiveToggle({ id, active, name, disabled }: { id: string; active: boolean; name: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={active ? "ghost" : "outline"}
      className={active ? "text-destructive hover:text-destructive" : ""}
      disabled={pending || disabled}
      onClick={() => {
        if (active && !confirm(`Deactivate ${name}? They are signed out everywhere immediately.`)) return;
        startTransition(async () => {
          const res = await setUserActive(id, !active);
          if (!res.ok) return void toast.error(res.error);
          toast.success(active ? `${name} deactivated` : `${name} reactivated`);
          router.refresh();
        });
      }}
    >
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
