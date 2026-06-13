import { useState } from "react";
import CalculadorLaser from "@/pages/CalculadorLaser";
import CalculadorUsinado from "@/pages/CalculadorUsinado";
import CalculadorTubo from "@/pages/CalculadorTubo";

type Aba = "laser" | "tubo" | "pintado" | "usinado";

const ABAS: Array<{ id: Aba; label: string }> = [
  { id: "laser", label: "Laser (chapa)" },
  { id: "usinado", label: "Usinado" },
  { id: "tubo", label: "Tubo" },
  { id: "pintado", label: "Montados pintados" },
];

export default function Calculador() {
  const [aba, setAba] = useState<Aba>("laser");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calculador de peças</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Escolha o tipo de peça. Cada aba tem o cálculo próprio do produto.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1 text-sm w-fit">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-md px-3 py-1.5 ${aba === a.id ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "laser" && <CalculadorLaser />}
      {aba === "usinado" && <CalculadorUsinado />}
      {aba === "tubo" && <CalculadorTubo />}
      {aba === "pintado" && <EmBreve titulo="Montados pintados" />}
    </div>
  );
}

function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      Cálculo de <strong>{titulo}</strong> em desenvolvimento. Me passe a fórmula e os dados
      (preços/medidas) que eu monto esta aba.
    </div>
  );
}
