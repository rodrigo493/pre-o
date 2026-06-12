import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const { data, error } = await supabase
  .from("produtos_mestre")
  .select("id, nome, codigo, tipo, unidade, unidade_secundaria, fator_conversao, conversao_op")
  .eq("tipo", "comprado")
  .or("nome.ilike.%tubo%,nome.ilike.%trefil%,nome.ilike.%cantoneira%,nome.ilike.%chato%,nome.ilike.%barra%")
  .order("nome");

if (error) throw error;
for (const p of data) {
  console.log([p.codigo ?? "-", p.nome, p.unidade ?? "-", p.fator_conversao ?? "-", p.conversao_op ?? "-", p.id].join(" | "));
}
console.log(`\nTotal: ${data.length}`);
