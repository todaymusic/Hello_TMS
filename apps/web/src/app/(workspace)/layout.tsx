import Sidebar from "@/components/Sidebar";
import NotificationCenter from "@/components/NotificationCenter";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{children}</main>
      <NotificationCenter />
    </div>
  );
}
