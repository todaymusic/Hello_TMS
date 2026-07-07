import Sidebar from "@/components/Sidebar";
import NotificationCenter from "@/components/NotificationCenter";
import AccessGuard from "@/components/AccessGuard";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <AccessGuard>{children}</AccessGuard>
      </main>
      <NotificationCenter />
    </div>
  );
}
