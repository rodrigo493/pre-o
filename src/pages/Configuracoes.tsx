import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConfig, saveConfig } from "@/repositories/configRepo";
import {
  defaultPercentages,
  percentageLabels,
  type PricingPercentages,
} from "@/lib/pricing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

type ConfigForm = PricingPercentages;

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
    defaultValues: { ...defaultPercentages },
  });

  useEffect(() => {
    if (configQuery.data) {
      reset(configQuery.data);
    }
  }, [configQuery.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const config: PricingPercentages = {
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
    reset({ ...defaultPercentages });
    toast.info("Valores padrão preenchidos. Clique em Salvar para aplicar.");
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
    </div>
  );
}
