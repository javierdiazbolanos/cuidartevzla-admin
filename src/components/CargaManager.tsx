/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cuídarte Venezuela - Gestión de Cargas (Solo Superusuario)
 * Permite listar y eliminar cargas completas de pacientes.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Trash2, RefreshCw, AlertTriangle, Shield, Loader2 } from "lucide-react";
import { getVolunteerCode, getAPIBase } from "../utils/api";

interface CargaItem {
  id: number;
  timestamp: string;
  ip_hex: string;
  codigo: string;
  num_registros: number;
}

export default function CargaManager() {
  const [cargas, setCargas] = useState<CargaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; ts: string; count: number } | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const fetchCargas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const code = getVolunteerCode();
      const res = await fetch(`${getAPIBase()}/carga_log.php?codigo=${encodeURIComponent(code)}`, {
        headers: {
          "Content-Type": "application/json",
          "X-Codigo-Voluntario": code
        }
      });
      if (!res.ok) {
        if (res.status === 403) {
          setError("Acceso denegado: no tienes permisos de superusuario.");
          setCargas([]);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.ok) {
        setCargas(data.cargas || []);
        setMigrationNeeded(data.status === 'migration_needed');
      } else {
        setError(data.error || "Error desconocido");
      }
    } catch (err: any) {
      console.error("[CargaManager] Error fetching:", err);
      setError(err.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCargas();
  }, [fetchCargas]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const code = getVolunteerCode();
      const res = await fetch(`${getAPIBase()}/carga_log.php?id=${id}&codigo=${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Codigo-Voluntario": code
        }
      });
      const data = await res.json();
      if (data.ok) {
        // Optimistic removal
        setCargas((prev) => prev.filter((c) => c.id !== id));
        setToast(`Carga #${id} eliminada (${data.pacientes_eliminados} pacientes)`);
      } else {
        setError(data.error || "Error al eliminar");
      }
    } catch (err: any) {
      console.error("[CargaManager] Error deleting:", err);
      setError(err.message || "Error de conexión");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const setToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Format IP from hex to readable
  const formatIP = (hex: string): string => {
    if (!hex || hex.length < 8) return "N/A";
    try {
      const parts = hex.match(/.{1,2}/g);
      if (!parts || parts.length < 4) return hex;
      return parts.slice(parts.length - 4).map((p) => parseInt(p, 16)).join(".");
    } catch {
      return hex;
    }
  };

  // Format timestamp to locale
  const formatTS = (ts: string): string => {
    try {
      return new Date(ts.replace(" ", "T") + "Z").toLocaleString("es-VE", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* Toast notification */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold animate-fadeIn">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-sky-600" />
          <h2 className="text-lg font-bold text-slate-800">Gestión de Cargas</h2>
          <span className="text-[10px] font-mono bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
            SUPERUSUARIO
          </span>
        </div>
        <button
          onClick={fetchCargas}
          disabled={loading}
          className="flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-sky-700 px-3 py-1.5 rounded-lg hover:bg-sky-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Migration needed banner */}
      {migrationNeeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-bold">Migración pendiente</span>
            <p className="text-xs text-amber-600 mt-0.5">
              La tabla <code className="bg-amber-100 px-1 rounded">carga_log</code> no existe aún.
              Visitá <a href="/api/migrate_carga_log.php" target="_blank" className="underline font-bold text-amber-900">/api/migrate_carga_log.php</a> una sola vez para crearla.
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start space-x-2 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-rose-400 hover:text-rose-600 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && cargas.length === 0 && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Cargando registros de cargas...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && cargas.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
          No hay cargas registradas aún.
        </div>
      )}

      {/* Table */}
      {cargas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Carga #</th>
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">IP origen</th>
                  <th className="px-4 py-3">Voluntario</th>
                  <th className="px-4 py-3 text-right">Registros</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargas.map((carga) => (
                  <tr
                    key={carga.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      deletingId === carga.id ? "opacity-50 bg-rose-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-sky-700">
                      #{carga.id}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">
                      {formatTS(carga.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                      {formatIP(carga.ip_hex)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                      {carga.codigo}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">
                      {carga.num_registros}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {confirmDelete?.id === carga.id ? (
                        <div className="flex items-center justify-center space-x-1.5">
                          <span className="text-[10px] text-rose-600 font-bold">¿Eliminar {confirmDelete.count} pacientes?</span>
                          <button
                            onClick={() => handleDelete(carga.id)}
                            disabled={deletingId === carga.id}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-1 rounded transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              id: carga.id,
                              ts: carga.timestamp,
                              count: carga.num_registros
                            })
                          }
                          disabled={deletingId === carga.id}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-30"
                          title="Eliminar esta carga y todos sus pacientes"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info footer */}
      <p className="text-[10px] text-slate-400 text-right">
        Al eliminar una carga se borran <strong>todos</strong> los pacientes asociados (borrado en cascada).
        Esta acción <strong>no se puede deshacer</strong>.
      </p>
    </div>
  );
}
