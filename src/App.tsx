import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Produtos from "@/pages/Produtos";
import Importar from "@/pages/Importar";
import ImportarCatalogo from "@/pages/ImportarCatalogo";
import Vincular from "@/pages/Vincular";
import ProdutoMontado from "@/pages/ProdutoMontado";
import Configuracoes from "@/pages/Configuracoes";

const queryClient = new QueryClient();
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/produtos" element={<Produtos />} />
                <Route path="/importar" element={<Importar />} />
                <Route path="/catalogo" element={<ImportarCatalogo />} />
                <Route path="/vincular" element={<Vincular />} />
                <Route path="/montado" element={<ProdutoMontado />} />
                <Route path="/config" element={<Configuracoes />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/produtos" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
