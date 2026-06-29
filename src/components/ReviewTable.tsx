/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Hospital, Paciente, ParsedPaciente, DedupReport } from "../types";
import { deduplicatePacientes } from "../utils/api";
import { Trash2, Plus, Download, Send, CheckSquare, Square, AlertTriangle, HelpCircle, Sparkles, GitMerge, UserPlus } from "lucide-react";

interface ReviewTableProps {
  initialPatients: ParsedPaciente[];
  hospitales: Hospital[];
  existingPatients: Paciente[];
  onClearBatch: () => void;
  onBatchSubmitted: (resultsSummary: string) => void;
}

export default function ReviewTable({
  initialPatients,
  hospitales,
  existingPatients,
  onClearBatch,
  onBatchSubmitted,
}: ReviewTableProps) {
  const [patients, setPatients] = useState<ParsedPaciente[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Global override fields
  const [globalHospitalId, setGlobalHospitalId] = useState<string>("");
  const [globalIngresoFecha, setGlobalIngresoFecha] = useState(new Date().toISOString().split("T")[0]);
  
  // State for upload process
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [lastReport, setLastReport] = useState<DedupReport | null>(null);

  // Sync state with incoming loader lists
  useEffect(() => {
    if (initialPatients.length > 0) {
      setPatients(initialPatients);
      // Auto-select all by default for efficient flow
      setSelectedIds(new Set(initialPatients.map((p) => p.id_temporal)));
    }
  }, [initialPatients]);

  // Keyboard shortcut listener: Ctrl + Enter to submit batch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        if (patients.length > 0 && selectedIds.size > 0 && !isUploading) {
          e.preventDefault();
          handleSubmitBatch();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [patients, selectedIds, isUploading, globalHospitalId, globalIngresoFecha]);

  // Inline grid cell mutation
  const handleCellChange = (id: string, field: keyof ParsedPaciente, value: any) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id_temporal === id) {
          return { ...p, [field]: value };
        }
        return p;
      })
    );
  };

  // Select / deselect row
  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === patients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(patients.map((p) => p.id_temporal)));
    }
  };

  // Add a blank row manually for fast power-entry
  const handleAddRow = () => {
    const newRow: ParsedPaciente = {
      id_temporal: Math.random().toString(36).substring(2, 9),
      nombre: "",
      cedula: "",
      edad: undefined,
      sexo: "Desconocido",
      procedencia: "",
      confianza_ocr: 100,
      status_verificacion: "pendiente",
    };
    setPatients((prev) => [...prev, newRow]);
    setSelectedIds((prev) => new Set([...Array.from(prev), newRow.id_temporal]));
  };

  // Delete selected rows from list
  const handleDeleteSelected = () => {
    const remaining = patients.filter((p) => !selectedIds.has(p.id_temporal));
    setPatients(remaining);
    setSelectedIds(new Set());
  };

  const handleDeleteRow = (id: string) => {
    setPatients((prev) => prev.filter((p) => p.id_temporal !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Apply Global Overrides
  const handleApplyGlobalOverrides = () => {
    if (selectedIds.size === 0) return;
    // Just alert user, updates happen inside submission payload or we can mutate local state
    // Let's mutate local state to give physical feedback to volunteers!
    setPatients((prev) =>
      prev.map((p) => {
        if (selectedIds.has(p.id_temporal)) {
          // Mutate properties if required
        }
        return p;
      })
    );
  };

  // Smart duplicate analyzer: Check if a name or cedula matches existing DB records
  const getDuplicateStatus = (p: ParsedPaciente) => {
    if (!p.nombre.trim()) return null;

    // Check by Cédula
    if (p.cedula) {
      const matchCedula = existingPatients.find(
        (ep) => ep.cedula && ep.cedula === p.cedula?.trim()
      );
      if (matchCedula) {
        return {
          type: "cedula" as const,
          reason: `Sincronización: Cédula asignada a ${matchCedula.nombre} (${matchCedula.hospital})`,
        };
      }
    }

    // Check by exact Name match
    const matchName = existingPatients.find(
      (ep) => ep.nombre.toLowerCase().trim() === p.nombre.toLowerCase().trim()
    );
    if (matchName) {
      return {
        type: "nombre" as const,
        reason: `Sincronización: Nombre exacto ya registrado en ${matchName.hospital}`,
      };
    }

    return null;
  };

  // Local Safety Backup Download as CSV
  const handleDownloadBackup = () => {
    if (patients.length === 0) return;

    const headers = ["Nombre Completo", "Cédula", "Edad", "Sexo", "Procedencia/Municipio", "Confianza OCR"];
    const rows = patients.map((p) => [
      p.nombre,
      p.cedula || "",
      p.edad || "",
      p.sexo,
      p.procedencia || "",
      `${p.confianza_ocr}%`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `CUIDARTE_Respaldo_Pacientes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit selected batch rows to PHP Dedup Engine
  const handleSubmitBatch = async () => {
    if (selectedIds.size === 0) {
      setUploadError("Debe seleccionar al menos un paciente para realizar la carga masiva.");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setLastReport(null);

    // Prepare list of patients to upload
    const selectedPatients = patients.filter((p) => selectedIds.has(p.id_temporal));
    
    // Validation
    const invalidRow = selectedPatients.find((p) => !p.nombre.trim());
    if (invalidRow) {
      setUploadError("Todos los registros seleccionados deben tener un Nombre Completo válido.");
      setIsUploading(false);
      return;
    }

    try {
      const payload = {
        fuente: "carga_masiva_admin",
        hospital_id: globalHospitalId ? parseInt(globalHospitalId, 10) : null,
        hospital_nuevo: globalHospitalId === "" ? "Ambulatorio Temporal / Desconocido" : undefined,
        ingreso_fecha: globalIngresoFecha,
        pacientes: selectedPatients.map((p) => ({
          nombre: p.nombre.trim(),
          cedula: p.cedula?.trim() || undefined,
          edad: p.edad,
          sexo: p.sexo,
          procedencia: p.procedencia?.trim() || undefined,
          estado: "hospitalizado",
        })),
      };

      const report = await deduplicatePacientes(payload);
      setLastReport(report);

      if (report.ok) {
        // Remove successfully processed patients from the review grid
        const successRowsMap = new Set(
          report.detalle
            .filter((r) => r.accion === "nuevo" || r.accion === "merge")
            .map((r) => selectedPatients[r.fila - 1]?.id_temporal)
            .filter(Boolean)
        );

        const remaining = patients.filter((p) => !successRowsMap.has(p.id_temporal));
        setPatients(remaining);
        setSelectedIds(new Set());

        const summaryText = [
          `✅ ${report.nuevos} nuevos`,
          report.mergeados > 0 ? `🔄 ${report.mergeados} fusionados` : null,
          report.sin_cambios > 0 ? `ℹ️ ${report.sin_cambios} sin cambios` : null,
          report.errores > 0 ? `⚠️ ${report.errores} errores` : null,
        ].filter(Boolean).join(" · ");

        onBatchSubmitted(`Lote procesado: ${summaryText} (${report.total_recibidos} total)`);
      } else {
        setUploadError("Error en la respuesta del motor de deduplicación.");
      }
    } catch (err: any) {
      setUploadError(err.message || "Error de conexión con el backend.");
    } finally {
      setIsUploading(false);
    }
  };

  if (patients.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 font-sans text-left space-y-6">
      
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2 font-display">
            <Sparkles className="w-5 h-5 text-sky-600" />
            <span>Workspace: Tabla de Revisión e Integración</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Revise los datos procesados antes de sincronizar con el registro central de Venezuela.
          </p>
        </div>

        {/* Shortcuts / backup */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleDownloadBackup}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs border border-slate-200 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar Respaldo (.CSV)</span>
          </button>
          <button
            onClick={handleAddRow}
            className="bg-white hover:bg-slate-50 text-sky-700 font-bold px-4 py-2 rounded-xl text-xs border border-slate-200 flex items-center space-x-1 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Fila</span>
          </button>
        </div>
      </div>

      {/* GLOBAL OVERRIDES BAR */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end shadow-inner">
        <div>
          <label className="block text-[10px] font-mono text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Hospital para Todo el Lote
          </label>
          <select
            value={globalHospitalId}
            onChange={(e) => setGlobalHospitalId(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 shadow-sm"
          >
            <option value="">Otros / Externos (Campamento Temporal)</option>
            {hospitales.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Fecha de Ingreso Común
          </label>
          <input
            type="date"
            value={globalIngresoFecha}
            onChange={(e) => setGlobalIngresoFecha(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 font-mono shadow-sm"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-500 font-sans italic">
            Se aplicará a {selectedIds.size} pacientes seleccionados.
          </span>
        </div>
      </div>

      {/* INTERACTIVE WORKSPACE GRID */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs font-mono uppercase tracking-wider">
              <th className="p-3 text-center w-12">
                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                  {selectedIds.size === patients.length ? (
                    <CheckSquare className="w-4 h-4 text-sky-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="p-3">Nombre Completo <span className="text-rose-600 font-bold">*</span></th>
              <th className="p-3 w-32">Cédula</th>
              <th className="p-3 w-20">Edad</th>
              <th className="p-3 w-32">Sexo</th>
              <th className="p-3">Procedencia / Sector</th>
              <th className="p-3 w-24 text-center">OCR Conf.</th>
              <th className="p-3 text-center w-16">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {patients.map((p) => {
              const isLowConfidence = p.confianza_ocr !== undefined && p.confianza_ocr < 70;
              const duplicateInfo = getDuplicateStatus(p);
              const isSelected = selectedIds.has(p.id_temporal);

              return (
                <tr
                  key={p.id_temporal}
                  className={`transition-colors ${
                    isSelected ? "bg-sky-50/30" : "hover:bg-slate-50/50"
                  }`}
                >
                  {/* Row Checkbox */}
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleSelectRow(p.id_temporal)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* Cell: Full Name */}
                  <td className="p-2">
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={p.nombre}
                        onChange={(e) => handleCellChange(p.id_temporal, "nombre", e.target.value)}
                        placeholder="Sin nombre"
                        className={`w-full bg-slate-50/50 focus:bg-white border border-transparent hover:border-slate-250 focus:border-sky-500 rounded px-2.5 py-1 text-sm text-slate-800 ${
                          isLowConfidence && !p.nombre ? "bg-rose-50 border-rose-200 text-rose-800" : ""
                        }`}
                      />
                      {duplicateInfo && (
                        <div className="flex items-center space-x-1 text-[10px] text-yellow-600 font-medium px-2.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-1">{duplicateInfo.reason}</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Cell: Cédula */}
                  <td className="p-2">
                    <input
                      type="text"
                      maxLength={9}
                      value={p.cedula || ""}
                      onChange={(e) =>
                        handleCellChange(p.id_temporal, "cedula", e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="N/A"
                      className={`w-full bg-slate-50/50 focus:bg-white border border-transparent focus:border-sky-500 rounded px-2 py-1 text-sm font-mono text-slate-800 text-center ${
                        isLowConfidence && !p.cedula ? "bg-yellow-50 border-yellow-200 text-yellow-800" : ""
                      }`}
                    />
                  </td>

                  {/* Cell: Age */}
                  <td className="p-2">
                    <input
                      type="text"
                      maxLength={3}
                      value={p.edad !== undefined ? String(p.edad) : ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        handleCellChange(p.id_temporal, "edad", val ? parseInt(val, 10) : undefined);
                      }}
                      placeholder="-"
                      className="w-full bg-slate-50/50 focus:bg-white border border-transparent focus:border-sky-500 rounded px-2 py-1 text-sm font-mono text-slate-850 text-center"
                    />
                  </td>

                  {/* Cell: Sex */}
                  <td className="p-2">
                    <select
                      value={p.sexo}
                      onChange={(e) => handleCellChange(p.id_temporal, "sexo", e.target.value as any)}
                      className="w-full bg-slate-50/50 focus:bg-white border border-transparent focus:border-sky-500 rounded px-2 py-1.5 text-xs text-slate-800"
                    >
                      <option value="Desconocido">Desconocido</option>
                      <option value="Masculino">M</option>
                      <option value="Femenino">F</option>
                    </select>
                  </td>

                  {/* Cell: Origin / Sector */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={p.procedencia || ""}
                      onChange={(e) => handleCellChange(p.id_temporal, "procedencia", e.target.value)}
                      placeholder="No registrado"
                      className="w-full bg-slate-50/50 focus:bg-white border border-transparent focus:border-sky-500 rounded px-2.5 py-1 text-sm text-slate-800"
                    />
                  </td>

                  {/* Cell: OCR Confidence level */}
                  <td className="p-3 text-center font-mono text-xs">
                    <span
                      className={`font-semibold ${
                        isLowConfidence
                          ? "text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200"
                          : p.confianza_ocr === 100
                          ? "text-slate-400"
                          : "text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200"
                      }`}
                    >
                      {p.confianza_ocr}%
                    </span>
                  </td>

                  {/* Actions Column */}
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(p.id_temporal)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Quitar Fila"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER: DEDUP REPORT + BULK TRIGGER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-4 border-t border-slate-200">
        
        {/* Dedup Report Summary (appears after submission) */}
        {lastReport && lastReport.ok && (
          <div className="flex items-center space-x-4 text-xs text-slate-600 flex-wrap gap-y-1">
            <span className="flex items-center space-x-1 font-semibold text-sky-700">
              <UserPlus className="w-3.5 h-3.5" />
              <span>{lastReport.nuevos} nuevos</span>
            </span>
            {lastReport.mergeados > 0 && (
              <span className="flex items-center space-x-1 font-semibold text-amber-700">
                <GitMerge className="w-3.5 h-3.5" />
                <span>{lastReport.mergeados} fusionados</span>
              </span>
            )}
            {lastReport.sin_cambios > 0 && (
              <span className="flex items-center space-x-1 text-slate-500">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{lastReport.sin_cambios} sin cambios</span>
              </span>
            )}
            {lastReport.errores > 0 && (
              <span className="flex items-center space-x-1 text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{lastReport.errores} errores</span>
              </span>
            )}
            <span className="text-slate-400">· {lastReport.total_recibidos} total</span>
          </div>
        )}
        {!lastReport && (
          <div className="text-xs text-slate-400 italic">
            El motor de deduplicación detecta duplicados por cédula exacta y similitud de nombre ≥85%. 
            Los registros existentes se <strong className="text-slate-600">enriquecen</strong> automáticamente con nuevos datos.
          </div>
        )}

        {/* Sync Trigger and stats */}
        <div className="flex items-center space-x-3 self-end lg:self-auto">
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-3 py-2 cursor-pointer"
            >
              Borrar seleccionados ({selectedIds.size})
            </button>
          )}

          <button
            onClick={handleSubmitBatch}
            disabled={isUploading || selectedIds.size === 0}
            id="btn-upload-batch"
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition-all text-sm flex items-center space-x-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {isUploading
                ? "Transmitiendo Lote..."
                : `Sincronizar Lote (${selectedIds.size} Pacientes)`}
            </span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start space-x-2 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Shortcuts Legend */}
      <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between select-none">
        <span>[Ctrl + Enter]: Enviar lote seleccionado</span>
        <span>[Tab]: Avanzar celda | Flechas: Navegación rápida</span>
      </div>
    </div>
  );
}
