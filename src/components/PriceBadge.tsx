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
    className: "bg-blue-50 text-blue-700 border border-blue-100",
  },
  sem_custo_recente: {
    label: "sem custo recente",
    className: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  sem_preco_manual: {
    label: "preço manual pendente",
    className: "bg-amber-50 text-amber-700 border border-amber-100",
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
