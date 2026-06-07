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

interface ConfigForm extends PricingPercentages {
  frete: number;
}

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
    defaultValues: { ...defaultPercentages, frete: 0 },
  });

  useEffect(() => {
    if (configQuery.data) {
      reset({ ...configQuery.data.config, frete: configQuery.data.frete });
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
    const frete = sanitize(values.frete);
    try {
      await saveConfig(config, frete);
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Configurações salvas. Preços recalculados.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    }
  });

  const restaurarPadrao = () => {
    reset({ ...defaultPercentages, frete: 0 });
    toast.info("Valores padrão preenchidos. Clique em Salvar para aplicar.");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Percentuais do markup fiscal aplicados sobre o maior custo dos últimos 3 meses
          (produtos comprados).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Percentuais do markup</CardTitle>
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
                    <Label htmlFor={`cfg-${key}`}>{percentageLabels[key]} (%)</Label>
                    <Input
                      id={`cfg-${key}`}
                      type="number"
                      step="0.01"
                      {...register(key, { valueAsNumber: true })}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cfg-frete">Frete (R$)</Label>
                  <Input
                    id="cfg-frete"
                    type="number"
                    min="0"
                    step="0.01"
                    {...register("frete", { valueAsNumber: true })}
                  />
                </div>
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
