// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditarMontadoDialog, { type ProdutoMontadoRow } from "@/components/EditarMontadoDialog";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }),
);

const produto: ProdutoMontadoRow = {
  id: "00000000-0000-0000-0000-000000000001",
  nome: "TESTE MONTADO",
  codigo: "TST.001",
  categoria: null,
  tipo: "montado",
  custo_manual: null,
  preco_manual: null,
  unidade: null,
  unidade_secundaria: null,
  fator_conversao: null,
  conversao_op: null,
  soma_nota: false,
  tempo_corte_min: null,
  mais_vendido: false,
  created_at: "",
};

describe("EditarMontadoDialog", () => {
  it("nao crasha ao reabrir com produto (regressao: hook depois de early return)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <EditarMontadoDialog produto={null} open={false} onOpenChange={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(() =>
      rerender(
        <MemoryRouter>
          <QueryClientProvider client={qc}>
            <EditarMontadoDialog produto={produto} open={true} onOpenChange={() => {}} />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
