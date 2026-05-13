import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  if (!hasBankCredentials()) {
    redirect("/setup");
  }

  return <Dashboard />;
}
