import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConfig, saveConfig } from "@/repositories/configRepo";
import { apagarTodosOsDados } from "@/repositories/resetRepo";
import {
  defaultPercentages,
  percentageLabels,
  type PricingPercentages,
} from "@/lib/pricing";
import type { AppConfig } from "@/lib/markupConfig";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

type ConfigForm = AppConfig;

const percentageKeys = Object.keys(percentageLabels) as Array<keyof PricingPercentages>;

function sanitize(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export default function Configuracoes() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ConfigForm>({
    defaultValues: { ...defaultPercentages, valorHoraLaser: 0 },
  });

  useEffect(() => {
    if (configQuery.data) {
      reset(configQuery.data);
    }
  }, [configQuery.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const config: AppConfig = {
      vendas: sanitize(values.vendas),
      marketing: sanitize(values.marketing),
      custoOperacional: sanitize(values.custoOperacional),
      ipi: sanitize(values.ipi),
      icms: sanitize(values.icms),
      pis: sanitize(values.pis),
      cofins: sanitize(values.cofins),
      csll: sanitize(values.csll),
      ir: sanitize(values.ir),
      lucro: sanitize(values.lucro),
      desgasteMaquinas: sanitize(values.desgasteMaquinas),
      valorHoraLaser: sanitize(values.valorHoraLaser),
    };
    try {
      await saveConfig(config);
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Configurações salvas. Preços recalculados.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    }
  });

  const restaurarPadrao = () => {
    reset({ ...defaultPercentages, valorHoraLaser: 0 });
    toast.info("Valores padrão preenchidos. Clique em Salvar para aplicar.");
  };

  const [apagando, setApagando] = useState(false);
  const apagarTudo = async () => {
    const ok = window.confirm(
      "Apagar TODOS os produtos, notas e vínculos? As configurações de markup são mantidas. Esta ação não pode ser desfeita.",
    );
    if (!ok) return;
    setApagando(true);
    try {
      await apagarTodosOsDados();
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      queryClient.invalidateQueries({ queryKey: ["pendentes"] });
      toast.success("Tudo apagado. Pode importar o catálogo oficial.");
    } catch (err) {
      toast.error(`Falha ao apagar: ${errMsg(err)}`);
    } finally {
      setApagando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Percentuais do markup fiscal aplicados sobre o maior custo dos últimos 3 meses
          (produtos comprados).
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Percentuais do markup</CardTitle>
        </CardHeader>
        <CardContent>
          {configQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : configQuery.isError ? (
            <p className="text-sm text-destructive">
              Falha ao carregar configurações: {errMsg(configQuery.error)}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {percentageKeys.map((key) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`cfg-${key}`}
                      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {percentageLabels[key]} (%)
                    </Label>
                    <Input
                      id={`cfg-${key}`}
                      type="number"
                      step="0.01"
                      className="font-mono-num"
                      {...register(key, { valueAsNumber: true })}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 border-t pt-4 sm:max-w-xs">
                <Label
                  htmlFor="cfg-valorHoraLaser"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Valor da hora do laser (R$/h)
                </Label>
                <Input
                  id="cfg-valorHoraLaser"
                  type="number"
                  step="0.01"
                  min="0"
                  className="font-mono-num"
                  {...register("valorHoraLaser", { valueAsNumber: true })}
                />
                <span className="text-xs text-muted-foreground">
                  Usado no custo das peças cortadas no laser (TB/LA): tempo de corte ÷ 60 × valor da hora.
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Salvando…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={restaurarPadrao}
                  disabled={isSubmitting}
                >
                  Restaurar padrão
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-destructive/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-destructive">Zona de perigo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Apaga <strong>todos os produtos, notas e vínculos</strong> para recomeçar do zero
            (as configurações de markup são mantidas). Útil antes de importar o catálogo oficial.
          </p>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void apagarTudo()}
              disabled={apagando}
            >
              {apagando ? "Apagando…" : "Apagar todos os dados"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
