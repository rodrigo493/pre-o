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
      <aside className="border-r bg-muted/20 p-4 flex flex-col gap-1 no-print">
        <div className="font-semibold mb-4 px-2">Preços Live</div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            cn("px-3 py-2 rounded-md text-sm hover:bg-muted", isActive && "bg-muted font-medium")}>
            {l.label}
          </NavLink>
        ))}
        <Button variant="ghost" className="mt-auto justify-start" onClick={signOut}>Sair</Button>
      </aside>
      <main className="p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
