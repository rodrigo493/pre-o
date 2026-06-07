import { formatCurrency } from "@/lib/pricing";
import type { ResolvedPrice } from "@/lib/priceResolution";

const DASH = "—";

export function formatMoeda(value: number | null): string {
  return value == null ? DASH : formatCurrency(value);
}

export function formatMargem(margemPercent: number | null): string {
  return margemPercent == null ? DASH : `${margemPercent.toFixed(1)}%`;
}

/** "nº 123 · 2026-05-01" da origem do custo, ou "—" se não há origem. */
export function formatOrigem(origem: ResolvedPrice["origem"]): string {
  if (!origem) return DASH;
  const numero = origem.notaNumero ? `nº ${origem.notaNumero}` : "nota";
  return `${numero} · ${origem.dataEmissao}`;
}
