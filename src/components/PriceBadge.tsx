import type { PriceStatus } from "@/lib/priceResolution";

interface BadgeStyle {
  label: string;
  className: string;
}

/**
 * Mapeamento EXAUSTIVO sobre PriceStatus. `Record<PriceStatus, ...>` força
 * erro de compilação se um novo status for adicionado e não tratado aqui.
 * `ok` não renderiza badge (label/className vazios e early-return abaixo).
 */
const STATUS_BADGE: Record<PriceStatus, BadgeStyle | null> = {
  ok: null,
  travado: {
    label: "preço travado",
    className: "bg-blue-100 text-blue-800 border border-blue-200",
  },
  sem_custo_recente: {
    label: "sem custo recente",
    className: "bg-amber-100 text-amber-800 border border-amber-200",
  },
  sem_preco_manual: {
    label: "preço manual pendente",
    className: "bg-amber-100 text-amber-800 border border-amber-200",
  },
};

interface PriceBadgeProps {
  status: PriceStatus;
}

export default function PriceBadge({ status }: PriceBadgeProps) {
  const badge = STATUS_BADGE[status];
  if (!badge) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
