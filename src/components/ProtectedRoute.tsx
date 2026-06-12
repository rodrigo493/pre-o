import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8">Carregando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
