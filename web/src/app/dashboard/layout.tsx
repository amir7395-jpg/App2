import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasActiveSubscription, loadSession, readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = loadSession(await readSessionToken(token));
  if (!session) redirect("/login");
  if (!hasActiveSubscription(session.business)) redirect("/pricing?subscribe=1");
  return (
    <div className="app">
      <Sidebar businessName={session.business.name} />
      <div className="main">{children}</div>
    </div>
  );
}
