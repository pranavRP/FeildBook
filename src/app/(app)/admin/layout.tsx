import { requireViewer } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireViewer(["admin"]);
  return (
    <>
      <PageHeader title="Admin" description="People, rigs & API keys for the operator tool, and the audit trail." />
      <AdminTabs />
      {children}
    </>
  );
}
