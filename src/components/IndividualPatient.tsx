/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Hospital, Paciente } from "../types";
import { deduplicatePacientes, searchPacientes, updatePaciente, isAuthorized } from "../utils/api";
import { Search, Plus, UserPlus, CheckCircle, RefreshCw, AlertTriangle, ShieldCheck, GitMerge } from "lucide-react";

interface IndividualPatientProps {
  hospitales: Hospital[];
  onPatientMutated: () => void; // Reload lists
}

export default function IndividualPatient({ hospitales, onPatientMutated }: IndividualPatientProps) {
  // --- INGRESO INDIVIDUAL INPUT STATE ---
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [edad, setEdad] = useState("");
  const [sexo, setSexo] = useState<"Masculino" | "Femenino" | "Desconocido">("Desconocido");
  const [procedencia, setProcedencia] = useState("");
  const [hospitalId, setHospitalId] = useState<string>("");
  const [hospitalNuevo, setHospitalNuevo] = useState("");
  const [ingresoFecha, setIngresoFecha] = useState(new Date().toISOString().split("T")[0]);
  const [estado, setEstado] = useState("hospitalizado");
  
  const [ingresoSuccess, setIngresoSuccess] = useState(false);
  const [ingresoLoading, setIngresoLoading] = useState(false);
  const [ingresoError, setIngresoError] = useState("");
  const [dedupResult, setDedupResult] = useState<{ accion: string; id: number; campos?: string[]; matchTipo?: string } | null>(null);
  
  // --- SEARCH AND UPDATE STATE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Paciente | null>(null);
  
  // Inline edit state
  const [editEstado, setEditEstado] = useState("");
  const [editHospitalId, setEditHospitalId] = useState<string>("");
  const [editNombre, setEditNombre] = useState("");
  const [editCedula, setEditCedula] = useState("");
  const [editEdad, setEditEdad] = useState("");
  const [editSexo, setEditSexo] = useState<"Masculino" | "Femenino" | "Desconocido">("Desconocido");
  const [editProcedencia, setEditProcedencia] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  
  // --- MAINTENANCE STATE ---
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  
  // Search trigger on query change
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);
  
  const handleSearch = async () => {
    setSearchLoading(true);
    try {
      const res = await searchPacientes(searchQuery);
      setSearchResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };
  
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setIngresoError("El nombre completo es obligatorio.");
      return;
    }
    
    setIngresoLoading(true);
    setIngresoError("");
    setIngresoSuccess(false);
    setDedupResult(null);
    
    try {
      const payload = {
        fuente: "formulario_individual",
        hospital_id: hospitalId ? parseInt(hospitalId, 10) : null,
        hospital_nuevo: hospitalId === "" ? hospitalNuevo.trim() || undefined : undefined,
        ingreso_fecha: ingresoFecha,
        pacientes: [
          {
            nombre: nombre.trim(),
            cedula: cedula.trim() || undefined,
            edad: edad ? parseInt(edad, 10) : undefined,
            sexo,
            procedencia: procedencia.trim() || undefined,
            estado,
          },
        ],
      };
      
      const report = await deduplicatePacientes(payload);
      
      if (report.ok && report.detalle.length > 0) {
        const result = report.detale[0];
        
        if (result.accion === "nuevo") {
          setIngresoSuccess(true);
          setDedupResult({ accion: "nuevo", id: result.id });
        } else if (result.accion === "merge") {
          setIngresoSuccess(true);
          setDedupResult({
            accion: "merge",
            id: result.id,
            campos: result.campos_agregados,
            matchTipo: result.match_tipo,
          });
        } else if (result.accion === "sin_cambios") {
          setIngresoSuccess(true);
          setDedupResult({ accion: "sin_cambios", id: result.id, matchTipo: result.match_tipo });
        } else {
          setIngresoError(result.motivo || "Error desconocido en deduplicación.");
          return;
        }
        
        setNombre("");
        setCedula("");
        setEdad("");
        setSexo("Desconocido");
        setProcedencia("");
        setHospitalId("");
        setHospitalNuevo("");
        onPatientMutated();
        setTimeout(() => { setIngresoSuccess(false); setDedupResult(null); }, 6000);
      } else {
        setIngresoError(report.detale?.[0]?.motivo || "No se pudo procesar al paciente.");
      }
    } catch (err: any) {
      setIngresoError(err.message || "Error de red al intentar registrar.");
    } finally {
      setIngresoLoading(false);
    }
  };
  
  const handleStartEdit = (p: Paciente) => {
    setEditingPatient(p);
    setEditEstado(p.estado);
    setEditHospitalId(p.hospital_id ? String(p.hospital_id) : "");
    setEditNombre(p.nombre);
    setEditCedula(p.cedula || "");
    setEditEdad(p.edad ? String(p.edad) : "");
    setEditSexo(p.sexo);
    setEditProcedencia(p.procedencia || "");
    setEditError("");
  };
  
  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPatient) return;
    if (!editNombre.trim()) {
      setEditError("El nombre completo es requerido.");
      return;
    }
    
    setEditLoading(true);
    setEditError("");
    
    try {
      const payload = {
        estado: editEstado,
        nombre: editNombre.trim(),
        cedula: editCedula.trim() || undefined,
        edad: editEdad ? parseInt(editEdad, 10) : undefined,
        sexo: editSexo,
        procedencia: editProcedencia.trim() || undefined,
        hospital_id: editHospitalId ? parseInt(editHospitalId, 10) : null,
      };
      
      const res = await updatePaciente(editingPatient.id, payload);
      if (res.ok) {
        setEditingPatient(null);
        handleSearch();
        onPatientMutated();
      } else {
        setEditError("Error al actualizar paciente.");
      }
    } catch (err: any) {
      setEditError(err.message || "Error al conectar con la API.");
    } finally {
      setEditLoading(false);
    }
  };
  
  // --- MAINTENANCE FUNCTIONS ---
  const runMaintenance = async (script: string) => {
    if (!window.confirm(`¿Está seguro de que desea ejecutar el script de mantenimiento '${script}'? Esto puede tardar varios minutos.`)) {
      return;
    }
    
    setMaintenanceRunning(true);
    setMaintenanceResult(null);
    setMaintenanceError(null);
    
    try {
      const volunteerCode = localStorage.getItem("codigo_voluntario") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (volunteerCode) {
        headers["X-Codigo-Voluntario"] = volunteerCode;
      }
      
      const res = await fetch(`/backend/${script}.php`, {
        method: "POST",
        headers,
        body: JSON.stringify({}), // empty body, scripts don't expect input
      });
      
      if (res.ok) {
        const text = await res.text();
        setMaintenanceResult(text);
      } else {
        const errorText = await res.text();
        setMaintenanceError(`Error ${res.status}: ${errorText}`);
      }
    } catch (err: any) {
      setMaintenanceError(err.message || "Error desconocido");
    } finally {
      setMaintenanceRunning(false);
    }
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans">
      {/* 1. REGISTRO INDIVIDUAL RÁPIDO */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center space-x-2.5 mb-5">
          <div className="w-10 h-10 bg-sky-50 border border-sky-200 text-sky-700 rounded-xl flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 font-display">Admisión Individual Rápida</h2>
            <p className="text-xs text-slate-500">Ingreso de pacientes de forma directa al sistema</p>
          </div>
        </div>
        
        <form onSubmit={handleCreatePatient} className="space-y-4 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Nombre Completo del Paciente <span className="text-sky-600 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Juan Andrés Pérez Delgado"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Cédula (Opcional)
              </label>
              <input
                type="text"
                maxLength={9}
                placeholder="Ej. 18274958"
                value={cedula}
                onChange={(e) => setCedula(e.target.value.replace(/\\D/g, ""))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none font-mono"
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Edad (Opcional)
              </label>
              <input
                type="text"
                maxLength={3}
                placeholder="Ej. 34"
                value={edad}
                onChange={(e) => setEdad(e.target.value.replace(/\\D/g, ""))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none font-mono"
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Sexo
              </label>
              <select
                value={sexo}
                onChange={(e) => setSexo(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
              >
                <option value="Desconocido">Desconocido</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Fecha de Ingreso
              </label>
              <input
                type="date"
                value={ingresoFecha}
                onChange={(e) => setIngresoFecha(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none font-mono"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Procedencia / Municipio / Sector
              </label>
              <input
                type="text"
                placeholder="Ej. Petare, Sector La Bombilla"
                value={procedencia}
                onChange={(e) => setProcedencia(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Hospital Destinatario <span className="text-sky-600 font-bold">*</span>
              </label>
              <select
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
              >
                <option value="">-- Registrar en hospital externo / temporal --</option>
                {hospitales.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre} ({h.municipio})
                  </option>
                ))}
              </select>
            </div>
            
            {hospitalId === "" && (
              <div className="md:col-span-2">
                <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                  Nombre del Hospital Externo o Campamento Temporal
                </label>
                <input
                  type="text"
                  placeholder="Ej. Ambulatorio Polideportivo La California"
                  value={hospitalNuevo}
                  onChange={(e) => setHospitalNuevo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
                />
              </div>
            )}
            
            <div>
              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Estado de Ingreso
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
              >
                <option value="hospitalizado">Hospitalizado (Activo)</option>
                <option value="alta">Alta Médica</option>
                <option value="referido">Referido / Trasladado</option>
                <option value="fallecido">Fallecido</option>
              </select>
            </div>
          </div>
          
          {ingresoError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-850 text-xs rounded-lg p-3 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{ingresoError}</span>
            </div>
          )}
          
          {ingresoSuccess && dedupResult && (
            <div className={`${
              dedupResult.accion === "merge"
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : dedupResult.accion === "sin_cambios"
                ? "bg-slate-50 border border-slate-200 text-slate-700"
                : "bg-sky-50 border border-sky-200 text-sky-800"
            } text-xs rounded-lg p-3 flex items-start space-x-2`}>
              {dedupResult.accion === "nuevo" && <CheckCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />}
              {dedupResult.accion === "merge" && <GitMerge className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              {dedupResult.accion === "sin_cambios" && <CheckCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />}
              <span>
                {dedupResult.accion === "nuevo" && (`✅ Paciente registrado como nuevo (ID: ${dedupResult.id})`)}
                {dedupResult.accion === "merge" && (
                  <>
                    🔄 <strong>Datos fusionados</strong> con paciente existente (ID: {dedupResult.id})
                    {dedupResult.matchTipo && <> — vía {dedupResult.matchTipo === "cedula" ? "cédula" : "similitud de nombre"}</>}
                    {dedupResult.campos && dedupResult.campos.length > 0 && (
                      <> · Campos agregados: <strong>{dedupResult.campos.join(", ")}</strong></>
                    )}
                  </>
                )}
                {dedupResult.accion === "sin_cambios" && (
                  <>ℹ️ Sin cambios: los datos son idénticos al registro existente (ID: {dedupResult.id})</>
                )}
              </span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={ingresoLoading}
            id="btn-submit-patient"
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{ingresoLoading ? "Registrando..." : "Registrar Paciente Directamente"}</span>
          </button>
        </form>
        
        {/* MAINTENANCE SECTION */}
        {isAuthorized() && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Utilidades de Mantenimiento</h3>
            <p className="text-sm text-slate-500 mb-2">
              Ejecute estas operaciones de mantenimiento sobre la base de datos existente. Solo disponible para usuarios autorizados.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => runMaintenance("run_homogenize_names")}
                disabled={maintenanceRunning}
                className="w-full flex items-center justify-between px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors"
              >
                <span>Homogeneizar nombres y cédulas</span>
                {maintenanceRunning && (
                  <span className="ml-2 animate-spin h-4 w-4 text-indigo-200">
                    <RefreshCw className="h-4 w-4" />
                  </span>
                )}
              </button>
              
              <button
                onClick={() => runMaintenance("run_dedup_existing")}
                disabled={maintenanceRunning}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
              >
                <span>Ejecutar deduplicación sobre existentes</span>
                {maintenanceRunning && (
                  <span className="ml-2 animate-spin h-4 w-4 text-emerald-200">
                    <RefreshCw className="h-4 w-4" />
                  </span>
                )}
              </button>
              
              <button
                onClick={() => runMaintenance("run_migracion_dedup")}
                disabled={maintenanceRunning}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors"
              >
                <span>Re-ejecutar migración de historial (crea tabla si no existe)</span>
                {maintenanceRunning && (
                  <span className="ml-2 animate-spin h-4 w-4 text-gray-200">
                    <RefreshCw className="h-4 w-4" />
                  </span>
                )}
              </button>
            </div>
            
            {maintenanceResult && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-bold text-green-800 mb-2">Resultado:</h4>
                <pre className="text-xs text-green-700 whitespace-pre-wrap">{maintenanceResult}</pre>
              </div>
            )}
            
            {maintenanceError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-bold text-red-800 mb-2">Error:</h4>
                <pre className="text-xs text-red-700 whitespace-pre-wrap">{maintenanceError}</pre>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 2. BÚSQUEDA Y ACTUALIZACIÓN DE ESTADO */}
      <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col h-full min-h-[500px]">
        <div className="flex items-center space-x-2.5 mb-5">
          <div className="w-10 h-10 bg-sky-50 border border-sky-200 text-sky-700 rounded-xl flex items-center justify-center">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 font-sans font-display">Buscador de Pacientes & Actualizador de Estado</h2>
            <p className="text-xs text-slate-500 font-sans">Busque registros por Cédula, Nombre o Centro de Salud para triage rápido</p>
          </div>
        </div>
        
        {/* Search input bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cédula, nombre o centro médico..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:outline-none"
          />
          {searchLoading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
            </div>
          )}
        </div>
        
        {/* Results / Inline editor */}
        <div className="flex-1 overflow-y-auto max-h-[420px] space-y-3 pr-1">
          {editingPatient ? (
            /* INLINE EDITOR PANEL */
            <form onSubmit={handleUpdatePatient} className="bg-slate-50 p-4 rounded-xl border border-sky-500/20 space-y-4 animate-fadeIn text-left shadow-inner font-sans">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-xs font-mono font-bold text-sky-700 uppercase tracking-widest flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Modo Modificación Autorizada</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingPatient(null)}
                  className="text-slate-500 hover:text-slate-750 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Cédula
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={editCedula}
                    onChange={(e) => setEditCedula(e.target.value.replace(/\\D/g, ""))}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Edad
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editEdad}
                    onChange={(e) => setEditEdad(e.target.value.replace(/\\D/g, ""))}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Sexo
                  </label>
                  <select
                    value={editSexo}
                    onChange={(e) => setEditSexo(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:oute-none"
                  >
                    <option value="Desconocido">Desconocido</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Procedencia / Municipio
                  </label>
                  <input
                    type="text"
                    value={editProcedencia}
                    onChange={(e) => setEditProcedencia(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:oute-none"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Estado Actual
                  </label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value)}
                    className="w-full bg-white border border-slave-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:oute-none font-medium"
                  >
                    <option value="hospitalizado">Hospitalizado (Activo)</option>
                    <option value="alta">Alta Médica</option>
                    <option value="referido">Referido / Trasladado</option>
                    <option value="fallecido">Fallecido</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Centro de Salud Asignado
                  </label>
                  <select
                    value={editHospitalId}
                    onChange={(e) => setEditHospitalId(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:oute-none"
                  >
                    <option value="">Otros / Externos</option>
                    {hospitales.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {editError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3">
                  {editError}
                </div>
              )}
              
              <div className="flex items-center space-x-3 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingPatient(null)}
                  className="bg-white hover:bg-slate-100 text-slate-700 hover:text-sky-800 text-xs font-bold border border-slate-200 hover:border-slate-300 rounded-lg px-3.5 py-1.5 w-full md:w-auto transition-all cursor-pointer shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer shadow-sm"
                >
                  {editLoading ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          ) : searchResults.length > 0 ? (
            /* SEARCH RESULTS LIST */
            <div className="space-y-2">
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between text-left gap-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-800 text-sm">{p.nombre}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.id}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider ${
                        p.estado === "hospitalizado"
                          ? "bg-sky-50 text-sky-700 border border-sky-200"
                          : p.estado === "referido"
                          ? "bg-sky-50 text-sky-700 border border-sky-200"
                          : p.estado === "alta"
                          ? "bg-slate-100 text-slate-600 border border-slate-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}>
                        {p.estado === "hospitalizado" ? "Hospitalizado" : p.estado === "referido" ? "Referido" : p.estado === "alta" ? "De Alta" : "Fallecido"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-slate-550 mt-2 font-sans">
                    <div>
                      Cédula: <span className="text-slate-700 font-mono">{p.cedula_masked || p.cedula || "No registrada"}</span>
                    </div>
                    <div>
                      Edad: <span className="text-slate-700">{p.edad ? p.edad + ' años' : "Desconocida"}</span>
                    </div>
                    <div>
                      Sexo: <span className="text-slate-700">{p.sexo}</span>
                    </div>
                    <div>
                      Ingreso: <span className="text-slate-700 font-mono">{p.ingreso_fecha || "Sin fecha"}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    Centro: <span className="text-sky-700 font-medium">{p.hospital}</span>
                    {p.procedencia && ' • ' + p.procedencia}
                  </p>

                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(p)}
                      className="bg-white hover:bg-slate-50 text-sky-700 hover:text-sky-800 text-xs font-bold border border-slate-200 hover:border-slate-300 rounded-lg px-3.5 py-1.5 w-full md:w-auto transition-all cursor-pointer shadow-sm"
                    >
                      Actualizar Estado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-slate-400 text-4xl mb-2">🔍</span>
              <p className="text-sm font-semibold text-slate-700">No se encontraron pacientes</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Escriba en el buscador para consultar o agregue un paciente usando el panel de registro rápido de la izquierda.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}