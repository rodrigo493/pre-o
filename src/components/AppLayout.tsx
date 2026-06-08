import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/produtos", label: "Produtos" },
  { to: "/importar", label: "Importar" },
  { to: "/vincular", label: "Vincular itens" },
  { to: "/montado", label: "Produto montado" },
  { to: "/config", label: "Configurações" },
];
export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="border-r border-border bg-card p-4 flex flex-col gap-1 no-print">
        <div className="flex items-center gap-2 mb-6 px-2">
          <img src="/logo-live.svg" alt="Live" className="h-6 w-auto" />
          <span className="text-sm text-muted-foreground">Preços</span>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            cn(
              "px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              isActive && "bg-secondary text-primary font-medium border-l-2 border-primary"
            )}>
            {l.label}
          </NavLink>
        ))}
        <Button
          variant="ghost"
          className="mt-auto justify-start text-muted-foreground hover:text-foreground"
          onClick={signOut}
        >
          Sair
        </Button>
      </aside>
      <main className="p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
