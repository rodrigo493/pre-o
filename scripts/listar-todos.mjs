import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data, error, count } = await supabase.from("produtos_mestre").select("nome, codigo, tipo, unidade", { count: "exact" }).order("tipo").order("nome").limit(300);
if (error) throw error;
for (const p of data) console.log([p.tipo, p.codigo ?? "-", p.nome, p.unidade ?? "-"].join(" | "));
console.log(`\nTotal no banco: ${count}`);
