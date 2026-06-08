import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/produtos", label: "Produtos" },
  { to: "/catalogo", label: "Importar catálogo" },
  { to: "/importar", label: "Importar notas" },
  { to: "/vincular", label: "Vincular itens" },
  { to: "/montado", label: "Produto montado" },
  { to: "/config", label: "Configurações" },
];

export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen grid grid-cols-[224px_1fr]">
      <aside className="bg-[#0A0A0A] text-zinc-300 p-4 flex flex-col gap-1 no-print">
        <div className="mb-7 px-2 pt-2">
          <img src="/logo-live.png" alt="Live" className="h-7 w-auto" />
          <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Preços
          </span>
        </div>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white",
                isActive &&
                  "border-l-2 border-primary bg-white/10 pl-2.5 text-white",
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
        <Button
          variant="ghost"
          className="mt-auto justify-start text-zinc-500 hover:bg-white/5 hover:text-white"
          onClick={signOut}
        >
          Sair
        </Button>
      </aside>
      <main className="overflow-auto bg-background p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
