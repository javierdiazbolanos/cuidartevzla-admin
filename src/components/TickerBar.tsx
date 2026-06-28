/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Megaphone, PlusCircle, X, Edit3, Trash2, Check } from "lucide-react";
import { Alerta } from "../types";
import { getDetectedIP, getVolunteerCode } from "../utils/api";

const LS_KEY = "cuidarte_alertas";

const INITIAL_ALERTAS: Alerta[] = [
  { id: "1", texto: "🚨 SISMO: Réplica de 4.2 registrada en Distrito Capital. Todos los equipos de rescate en alerta.", severidad: "critica", timestamp: "Hace 10m", voluntario: "Admin" },
  { id: "2", texto: "🏥 ALERTA: Hospital Universitario de Caracas reporta 98% de capacidad en Emergencia general.", severidad: "alta", timestamp: "Hace 25m", voluntario: "1002" },
  { id: "3", texto: "📦 SUMINISTROS: Se requiere con urgencia gasas, kits de sutura e inyectadoras en el Hospital J.M. de los Ríos.", severidad: "critica", timestamp: "Hace 40m", voluntario: "1034" },
  { id: "4", texto: "🚚 TRANSPORTE: Se solicita camioneta 4x4 disponible en Caracas para traslado de insumos médicos hacia Antímano.", severidad: "media", timestamp: "Hace 1h", voluntario: "2015" },
  { id: "5", texto: "⚕️ PERSONAL: Hospital Domingo Luciani convoca personal voluntario de traumatología y enfermería para guardia de contingencia.", severidad: "alta", timestamp: "Hace 2h", voluntario: "Admin" },
];

// ─── Color scheme matching EmergencyAlerts (public app) ───
// critica/alta → rose   | media → amber  | baja → sky
const severidadStyles: Record<string, {
  bg: string; border: string; text: string;
  dot: string; dotStatic: string; icon: string;
  hover: string; hoverText: string; light: string; tag: string;
  badge: string; pagerBorder: string;
}> = {
  critica: { bg: 'bg-rose-50/90', border: 'border-rose-200', text: 'text-rose-950', dot: 'bg-rose-500', dotStatic: 'bg-rose-600', icon: 'text-rose-600', hover: 'hover:bg-rose-50', hoverText: 'hover:text-rose-950', light: 'text-rose-400', tag: 'text-rose-500', badge: 'bg-rose-600 hover:bg-rose-700', pagerBorder: 'border-rose-100' },
  alta:    { bg: 'bg-rose-50/90', border: 'border-rose-200', text: 'text-rose-950', dot: 'bg-rose-500', dotStatic: 'bg-rose-600', icon: 'text-rose-600', hover: 'hover:bg-rose-50', hoverText: 'hover:text-rose-950', light: 'text-rose-400', tag: 'text-rose-500', badge: 'bg-rose-600 hover:bg-rose-700', pagerBorder: 'border-rose-100' },
  media:   { bg: 'bg-amber-50/90', border: 'border-amber-200', text: 'text-amber-950', dot: 'bg-amber-500', dotStatic: 'bg-amber-600', icon: 'text-amber-600', hover: 'hover:bg-amber-50', hoverText: 'hover:text-amber-950', light: 'text-amber-400', tag: 'text-amber-500', badge: 'bg-amber-600 hover:bg-amber-700', pagerBorder: 'border-amber-100' },
  baja:    { bg: 'bg-sky-50/90', border: 'border-sky-200', text: 'text-sky-950', dot: 'bg-sky-500', dotStatic: 'bg-sky-600', icon: 'text-sky-600', hover: 'hover:bg-sky-50', hoverText: 'hover:text-sky-950', light: 'text-sky-400', tag: 'text-sky-500', badge: 'bg-sky-600 hover:bg-sky-700', pagerBorder: 'border-sky-100' },
};

function loadLocalAlerts(): Alerta[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveLocalAlerts(alerts: Alerta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(alerts));
}

async function fetchServerAlerts(): Promise<Alerta[]> {
  try {
    const res = await fetch("/api/alertas.php");
    if (!res.ok) throw new Error("Server error");
    const json = await res.json();
    if (json.ok && Array.isArray(json.data)) {
      return json.data.map((a: any) => ({
        id: String(a.id),
        texto: a.texto,
        severidad: a.severidad || "media",
        timestamp: new Date(a.created_at).toLocaleString("es-VE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: true }),
        voluntario: a.voluntario || "Admin",
      }));
    }
  } catch (e) {
    console.warn("[Alerta] Server fetch failed, using localStorage", e);
  }
  return [];
}

async function postToServer(payload: { action: string; id?: number; texto?: string; severidad?: string; voluntario?: string }): Promise<boolean> {
  try {
    const code = getVolunteerCode() || "";
    const res = await fetch("/api/alertas.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Codigo-Voluntario": code },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.ok === true;
  } catch (e) {
    console.warn("[Alerta] Server POST failed", e);
    return false;
  }
}

export default function TickerBar() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTexto, setNewTexto] = useState("");
  const [newSeveridad, setNewSeveridad] = useState<"baja" | "media" | "alta" | "critica">("media");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const serverAlerts = await fetchServerAlerts();
      if (serverAlerts.length > 0) {
        setAlertas(serverAlerts);
        saveLocalAlerts(serverAlerts);
        return;
      }
      const localAlerts = loadLocalAlerts();
      if (localAlerts.length > 0) {
        setAlertas(localAlerts);
        return;
      }
      setAlertas(INITIAL_ALERTAS);
      saveLocalAlerts(INITIAL_ALERTAS);
    })();
  }, []);

  const saveAlerts = async (updated: Alerta[]) => {
    setAlertas(updated);
    saveLocalAlerts(updated);
  };

  const handleStartEdit = (a: Alerta) => {
    setEditingId(a.id);
    setNewTexto(a.texto);
    setNewSeveridad(a.severidad);
    setShowAddForm(true);
  };

  const handleAddAlerta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTexto.trim()) return;

    if (editingId) {
      const updated = alertas.map((a) =>
        a.id === editingId ? { ...a, texto: newTexto.trim(), severidad: newSeveridad } : a
      );
      await saveAlerts(updated);
      postToServer({ action: "update", id: parseInt(editingId, 10) || 0, texto: newTexto.trim(), severidad: newSeveridad });
      setEditingId(null);
    } else {
      const code = getVolunteerCode() || "Móvil";
      const tempId = Math.random().toString(36).substring(2, 9);
      const newAlert: Alerta = { id: tempId, texto: newTexto.trim(), severidad: newSeveridad, timestamp: "Ahora", voluntario: code };
      const updated = [newAlert, ...alertas];
      await saveAlerts(updated);
      setCurrentIndex(0);
      const ok = await postToServer({ action: "create", texto: newTexto.trim(), severidad: newSeveridad, voluntario: code });
      if (!ok) console.warn("[Alerta] Saved locally only — server unavailable");
    }

    setNewTexto("");
    setNewSeveridad("media");
    setShowAddForm(false);
  };

  const handleDeleteAlerta = async (id: string) => {
    const filtered = alertas.filter((a) => a.id !== id);
    await saveAlerts(filtered);
    postToServer({ action: "delete", id: parseInt(id, 10) || 0 });
    if (editingId === id) { setEditingId(null); setNewTexto(""); setNewSeveridad("media"); }
    if (currentIndex >= filtered.length && filtered.length > 0) setCurrentIndex(filtered.length - 1);
  };

  const handlePrev = () => { if (alertas.length === 0) return; setCurrentIndex((prev) => (prev === 0 ? alertas.length - 1 : prev - 1)); };
  const handleNext = () => { if (alertas.length === 0) return; setCurrentIndex((prev) => (prev === alertas.length - 1 ? 0 : prev + 1)); };

  const currentAlert = alertas[currentIndex];
  const s = currentAlert ? (severidadStyles[currentAlert.severidad] || severidadStyles.media) : severidadStyles.media;

  return (
    <div className="space-y-3">
      {/* ─── Ticker banner — dynamic colors matching public app ─── */}
      <div className={`${s.bg} ${s.border} rounded-2xl p-3 px-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-left`}>
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${s.dot}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${s.dotStatic}`}></span>
          </div>
          <AlertTriangle className={`w-4 h-4 ${s.icon} shrink-0`} />
          <div className="min-w-0 flex-1">
            {currentAlert ? (
              <p className={`text-xs sm:text-sm font-semibold ${s.text} leading-snug`}>
                {currentAlert.texto}{" "}
                <span className={`text-[10px] font-mono ${s.tag} font-normal`}>({currentAlert.voluntario})</span>
              </p>
            ) : (
              <p className="text-xs sm:text-sm font-semibold text-slate-500">No hay alertas operacionales activas en este momento.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {alertas.length > 0 && (
            <div className={`bg-white ${s.pagerBorder} rounded-xl px-2 py-1 flex items-center space-x-3 shadow-xs font-mono text-xs ${s.text} select-none`}>
              <button type="button" onClick={handlePrev} className={`${s.hover} p-1 rounded-lg transition-colors ${s.icon} ${s.hoverText} cursor-pointer`} title="Anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold tracking-tight">{currentIndex + 1} / {alertas.length}</span>
              <button type="button" onClick={handleNext} className={`${s.hover} p-1 rounded-lg transition-colors ${s.icon} ${s.hoverText} cursor-pointer`} title="Siguiente">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setShowAddForm(!showAddForm); if (showAddForm) { setEditingId(null); setNewTexto(""); setNewSeveridad("media"); } }}
            id="btn-broadcast-alert"
            className={`${s.badge} text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer hover:shadow-md active:scale-98`}
          >
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            <span>Difundir Alerta</span>
          </button>
        </div>
      </div>

      {/* ─── Broadcast Form ─── */}
      {showAddForm && (
        <div className="p-5 bg-white border border-slate-200 rounded-2xl animate-fadeIn relative text-left text-slate-900 shadow-sm">
          <button
            type="button" onClick={() => { setShowAddForm(false); setEditingId(null); setNewTexto(""); setNewSeveridad("media"); }}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>

          <form onSubmit={handleAddAlerta} className="max-w-4xl mx-auto space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Megaphone className={`w-4 h-4 ${editingId ? "text-amber-500" : s.icon}`} />
              <span>{editingId ? "Modificar Alerta de Operaciones Especiales" : "Nueva Alerta de Operaciones Especiales (Sismo 2026)"}</span>
              {editingId && (
                <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold">Editando ID: {editingId}</span>
              )}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3">
                <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Texto de la Alerta (Breve, accionable)</label>
                <input type="text" required placeholder="Ej: Hospital Domingo Luciani al 90% de capacidad pediátrica. Recomendar desvío." value={newTexto} onChange={(e) => setNewTexto(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Severidad</label>
                <select value={newSeveridad} onChange={(e) => setNewSeveridad(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none">
                  <option value="baja">Baja (Informativo)</option>
                  <option value="media">Media (Precaución)</option>
                  <option value="alta">Alta (Urgente)</option>
                  <option value="critica">Crítica (Riesgo Vital)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 gap-2 flex-wrap">
              <p className="text-[10px] font-mono text-slate-400">
                Difundido desde IP: <span className="text-slate-600 font-bold">{getDetectedIP()}</span> por Voluntario: <span className="text-slate-600 font-bold">{getVolunteerCode()}</span>
              </p>
              <div className="flex items-center space-x-2">
                {editingId && (
                  <button type="button" onClick={() => { setEditingId(null); setNewTexto(""); setNewSeveridad("media"); }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer">Cancelar Edición</button>
                )}
                <button type="submit"
                  className={`text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm ${editingId ? "bg-amber-600 hover:bg-amber-500" : s.badge}`}>
                  {editingId ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                  <span>{editingId ? "Actualizar Alerta" : "Transmitir Alerta"}</span>
                </button>
              </div>
            </div>

            {alertas.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 font-sans">
                <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2 font-bold">Administrar Alertas Publicadas</span>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                  {alertas.map((a) => {
                    const as = severidadStyles[a.severidad] || severidadStyles.media;
                    return (
                      <div key={a.id} className="flex justify-between items-center bg-slate-50 hover:bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${a.severidad === "critica" ? `${as.dot} animate-pulse` : as.dotStatic}`} />
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">[{a.timestamp}]</span>
                          <span className="truncate font-medium text-slate-700">{a.texto}</span>
                          <span className={`text-[10px] font-mono ${as.tag} shrink-0`}>({a.voluntario})</span>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0 ml-4">
                          <button type="button" onClick={() => handleStartEdit(a)}
                            className="text-slate-500 hover:text-sky-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer" title="Modificar Alerta">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDeleteAlerta(a.id)}
                            className="text-rose-600 hover:text-rose-800 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer" title="Eliminar Alerta">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}