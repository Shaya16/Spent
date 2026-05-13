import { redirect } from "next/navigation";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { SetupWizard } from "@/components/setup/setup-wizard";

export const dynamic = "force-dynamic";

interface SetupPageProps {
  searchParams: Promise<{ force?: string }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const { force } = await searchParams;

  if (hasBankCredentials() && force !== "1") {
    redirect("/");
  }

  return <SetupWizard />;
}
