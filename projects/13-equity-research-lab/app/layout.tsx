import "./globals.css";
import { cookies } from "next/headers";
import { SESSION_COOKIE, authConfig, readSession } from "@/lib/server/auth";
import { MainNavigation } from "@/components/MainNavigation";
import { PortfolioPrivacyProvider, PrivacyControl } from "@/components/PortfolioPrivacy";
import { PortfolioSessionProvider } from "@/components/PortfolioSession";

export const metadata = { title: "Equity Research Lab", description: "Evidence-first stock research, prediction snapshots and retrospectives." };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await readSession(authConfig(), (await cookies()).get(SESSION_COOKIE)?.value);
  return <html lang="en"><body>
    <MainNavigation email={session?.email} />
    <PortfolioSessionProvider><PortfolioPrivacyProvider><main><PrivacyControl />{children}</main></PortfolioPrivacyProvider></PortfolioSessionProvider>
    <footer>Evidence first. Predictions frozen. Learn from every call.</footer>
  </body></html>;
}
