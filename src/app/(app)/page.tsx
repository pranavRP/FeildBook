import { ShieldAlert } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { serverEnv } from "@/lib/server-env";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;
  const data = await getDashboardData();
  const firstName = (viewer.profile.full_name ?? viewer.email).split(" ")[0];

  return (
    <DashboardView
      initial={data}
      title={`Good ${greeting(serverEnv.timezone)}, ${firstName}`}
      description="Task pipeline and data collection across every venue you can see."
    >
      {denied && (
        <Alert className="mb-6">
          <ShieldAlert />
          <AlertDescription>Your role doesn&apos;t have access to that page.</AlertDescription>
        </Alert>
      )}
    </DashboardView>
  );
}

function greeting(tz: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
