/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Hospital, Paciente, ParsedPaciente } from "./types";
import { initializeAPI, getHospitales, searchPacientes, getVolunteerCode, isAuthorized, setVolunteerCode, getDetectedIP } from "./utils/api";
import SecurityGate from "./components/SecurityGate";
import TickerBar from "./components/TickerBar";
import MassiveLoader from "./components/MassiveLoader";
import ReviewTable from "./components/ReviewTable";
import IndividualPatient from "./components/IndividualPatient";
import TransportManager from "./components/TransportManager";
import CargaManager from "./components/CargaManager";
import { Activity, Users, Truck, Heart, FileSpreadsheet, PlusCircle, LogOut, ShieldCheck, HelpCircle, AlertCircle, Database, Share } from "lucide-react";

export default function App() {
  const [authorized, setAuthorized] = useState(false);
  const [activeTag, setActiveTag] = useState<"carga" | "individual" | "transporte" | "gestion">("carga");
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [existingPatients, setExistingPatients] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);

  // Consolidated batch list in the review workspace
  const [reviewBatch, setReviewBatch] = useState<ParsedPaciente[]>([]);
  const [batchSummaryMessage, setBatchSummaryMessage] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isSuperuser, setIsSuperuser] = useState(false);

  // Helper para Toasts rápidos
  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  // Initialize API and load database resources
  useEffect(() => {
    initializeAPI().then(() => {
      setAuthorized(isAuthorized());
      if (isAuthorized()) {
        loadDataResources();
        checkSuperUser();
      } else {
        setLoading(false);
      }
    });
  }, [authorized]);

  const checkSuperUser = async () => {
    try {
      const code = getVolunteerCode();
      const res = await fetch(`/api/superuser_status.php?codigo=${encodeURIComponent(code)}`, {
        headers: { "X-Codigo-Voluntario": code }
      });
      if (res.ok) {
        const data = await res.json();
        setIsSuperuser(data.is_superuser || false);
      }
    } catch (err) {
      console.warn("[App] Error checking superuser:", err);
      setIsSuperuser(false);
    }
  };

  const loadDataResources = async () => {
    setLoading(true);
    try {
      const [hospList, patList] = await Promise.all([
        getHospitales(),
        searchPacientes(""),
      ]);
      setHospitales(hospList);
      setExistingPatients(patList);
    } catch (err) {
      console.error("Error cargando recursos de base de datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchLoaded = (newPatients: ParsedPaciente[]) => {
    // Append or overwrite current batch
    setReviewBatch((prev) => {
      // Avoid exact ID duplications in temporary review list
      const next = [...prev];
      newPatients.forEach((np) => {
        if (!next.some((p) => p.nombre.toLowerCase().trim() === np.nombre.toLowerCase().trim())) {
          next.push(np);
        }
      });
      return next;
    });
    setBatchSummaryMessage("");
  };

  const handleBatchSubmitted = (summaryText: string) => {
    setBatchSummaryMessage(summaryText);
    setReviewBatch([]); // Clear active batch
    loadDataResources(); // Refresh central lists
  };

  const handleLogout = () => {
    setVolunteerCode("");
    setAuthorized(false);
    setReviewBatch([]);
    setBatchSummaryMessage("");
    setShowLogoutConfirm(false);
  };

  // Guard Clause: Security Check
  if (!authorized) {
    return <SecurityGate onAuthorized={() => setAuthorized(true)} />;
  }

  // Active statistics calculation
  const totalHospitalized = existingPatients.filter((p) => p.estado === "hospitalizado").length;
  const totalDischarged = existingPatients.filter((p) => p.estado === "alta").length;
  const totalReferrals = existingPatients.filter((p) => p.estado === "referido").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-sky-200 selection:text-sky-950">
      {/* Header with reduced height and sticky behavior */}
      <header className="bg-white border-b border-slate-200 px-4 py-2 sticky top-0 z-40 backdrop-md blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Logo Brand / Identity */}
          <div className="flex items-center space-x-3.5 text-left">
            <div className="w-8 h-8 flex items-center justify-center rounded-[1rem] bg-white shadow-md overflow-hidden shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}logo_cuidarte.svg`}
                alt="Cuídarte Venezuela"
                className="w-full h-full object-cover rounded-[1rem]"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[8px] font-mono font-bold tracking-widest text-sky-700 uppercase bg-sky-50 border border-sky-200 px-1 py-0.5 rounded-full">
                  OPERATIVO INTERNO
                </span>
                <span className="text-[8px] font-mono text-slate-400 font-medium">Sismo Jun-2026</span>
              </div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight font-display">
                Carga de Pacientes — Voluntarios
              </h1>
              <p className="text-xs text-slate-500 font-sans flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Panel Administrativo • <strong className="text-slate-700 font-semibold">Cuídarte Venezuela</strong></span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <a
                  href="/"
                  className="text-sky-700 hover:text-sky-800 font-bold hover:underline inline-flex items-center gap-1 transition-colors"
                >
                  Ir a la sección de búsqueda
                </a>
              </p>
            </div>
          </div>

          {/* Quick Real-Time Analytics Dashboard Banner (hidden on small screens) */}
          <div className="hidden sm:block grid grid-cols-3 gap-2 sm:gap-4 max-w-md w-full bg-slate-100 p-3 rounded-xl border border-slate-200 text-left shadow-sm">
            <div>
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">Hospitalizados</span>
              <span className="text-sm font-bold text-sky-600 font-mono tracking-tight">
                {loading ? "..." : totalHospitalized}
              </span>
            </div>
            <div>
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">Traslados/Ref</span>
              <span className="text-sm font-bold text-sky-600 font-mono tracking-tight">
                {loading ? "..." : totalReferrals}
              </span>
            </div>
            <div>
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">De Alta Médica</span>
              <span className="text-sm font-bold text-slate-600 font-mono tracking-tight">
                {loading ? "..." : totalDischarged}
              </span>
            </div>
          </div>

          {/* Session verification identity */}
          <div className="flex items-center space-x-3 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-left self-end lg:self-auto shrink-0 shadow-sm relative">
            <div className="w-2 h-2 rounded-full bg-sky-500" />
            <div>
              <span className="text-[8px] font-mono text-slate-500 block uppercase">Código Voluntario</span>
              <span className="text-xs font-mono font-bold text-slate-700">{getVolunteerCode()}</span>
            </div>
            {!showLogoutConfirm ? (
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="text-slate-400 hover:text-rose-600 ml-1.5 p-1 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                title="Cerrar sesión temporal"
              >
                <LogOut className="w-3 h-3" />
              </button>
            ) : (
              <div className="flex items-center space-x-0.5 ml-1.5 bg-white border border-slate-200 px-1 py-0.5 rounded-lg shadow-sm">
                <span className="text-[8px] text-slate-500 font-semibold font-mono">¿Cerrar?</span>
                <button
                  onClick={handleLogout}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[8px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                >
                  Sí
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[8px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main navigation tabs (pills) */}
      <nav className="bg-white border-b border-slate-200 sticky top-[14px] sm:top-[16px] z-30 py-2 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTag("carga")}
              className={`py-2 px-4 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer ${
                activeTag === "carga"
                  ? "bg-[#002f87] text-white shadow-md shadow-[#002f87]/10"
                  : "bg-[#f4f6fa] hover:bg-[#e9ecf4] text-slate-600 hover:text-slate-800"
              }`}
            >
              <FileSpreadsheet className="w-3 h-3 shrink-0" />
              <span>INGRESO MASIVO (CSV)</span>
              {reviewBatch.length > 0 && (
                <span className="bg-rose-500 text-white font-bold text-[8px] px-1.5 py-0.5 rounded-full font-mono animate-bounce ml-1">
                  {reviewBatch.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTag("individual")}
              className={`py-2 px-4 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer ${
                activeTag === "individual"
                  ? "bg-[#002f87] text-white shadow-md shadow-[#002f87]/10"
                  : "bg-[#f4f6fa] hover:bg-[#e9ecf4] text-slate-600 hover:text-slate-800"
              }`}
            >
              <PlusCircle className="w-3 h-3 shrink-0" />
              <span>ADMISIÓN INDIVIDUAL</span>
            </button>
            <button
              onClick={() => setActiveTag("transporte")}
              className={`py-2 px-4 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer ${
                activeTag === "transporte"
                  ? "bg-[#002f87] text-white shadow-md shadow-[#002f87]/10"
                  : "bg-[#f4f6fa] hover:bg-[#e9ecf4] text-slate-600 hover:text-slate-800"
              }`}
            >
              <Truck className="w-3 h-3 shrink-0" />
              <span>TRANSPORTE VOLUNTARIO</span>
            </button>
            {isSuperuser && (
              <button
                onClick={() => setActiveTag("gestion")}
                className={`py-2 px-4 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer ${
                  activeTag === "gestion"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200"
                }`}
              >
                <Database className="w-3 h-3 shrink-0" />
                <span>GESTIÓN DE CARGAS</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main container with top padding to avoid being hidden behind sticky header */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pt-14 space-y-8">
        {/* OPERATIONAL ALERTS BAR */}
        <TickerBar />

        {/* BATCH UPLOAD OUTCOMES BANNER */}
        {batchSummaryMessage && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start space-x-3 text-sky-800 text-sm text-left animate-fadeIn shadow-sm">
            <ShieldCheck className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
            <div>
              <span className="font-bold text-sky-800">¡Sincronización Operacional Exitosa!</span>
              <p className="text-xs text-sky-600 mt-0.5">{batchSummaryMessage}</p>
            </div>
            <button
              onClick={() => setBatchSummaryMessage("")}
              className="text-sky-700 hover:text-sky-950 text-xs font-bold font-mono uppercase shrink-0 ml-auto"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* TAB CONTENTS SWITCHER WITH ENTRY TRANSITIONS */}
        <div className="animate-fadeIn">
          {/* TAB A: BATCH CARGA MASIVA */}
          {activeTag === "carga" && (
            <div className="space-y-8">
              {/* Massive loader input workspace */}
              <MassiveLoader onBatchLoaded={handleBatchLoaded} onToast={triggerToast} />

              {/* In-memory interactive review table */}
              <ReviewTable
                initialPatients={reviewBatch}
                hospitales={hospitales}
                existingPatients={existingPatients}
                onClearBatch={() => setReviewBatch([])}
                onBatchSubmitted={handleBatchSubmitted}
              />

              {/* Fallback info when review table is empty */}
              {reviewBatch.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-2 animate-pulse">
                    <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">Tabla de Revisión Inactiva</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    La tabla de revisión se activará una vez que pegue una lista de texto, suba un documento CSV/Excel, o realice un escaneo de cámara.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB B: ADMISIÓN INDIVIDUAL Y BUSCADOR */}
          {activeTag === "individual" && (
            <IndividualPatient
              hospitales={hospitales}
              onPatientMutated={loadDataResources}
              authorized={authorized}
            />
          )}

          {/* TAB C: DIRECTORY DE TRANSPORTE */}
          {activeTag === "transporte" && (
            <TransportManager />
          )}

          {/* TAB D: GESTIÓN DE CARGAS (solo superusuario) */}
          {activeTag === "gestion" && isSuperuser && (
            <CargaManager />
          )}
        </div>
      </main>

      {/* System footer & auditing data */}
      <footer className="bg-white border-t border-slate-200 px-4 py-4 text-xs text-slate-500 font-sans mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Legal / Accountability statement */}
          <div className="text-center sm:text-left space-y-1">
            <p className="font-semibold text-slate-700">
              Carga de Pacientes — Voluntarios (Cuídarte Venezuela)
            </p>
            <p className="max-w-xl text-[9px] leading-relaxed text-slate-400">
              De acuerdo con las normativas operativas internas de ayuda humanitaria para contingencias de sismo 2026, todos los registros realizados por voluntarios autorizados quedan guardados con firma y traza de responsabilidad técnica.
            </p>
          </div>

          {/* Security details & configuration connection */}
          <div className="flex flex-col items-center sm:items-end text-center sm:text-right font-mono text-[8px] text-slate-500 space-y-1">
            <div>
              Auditoría IP: <strong className="text-slate-700">{getDetectedIP()}</strong>
            </div>
            <div>
              Firma Voluntario: <strong className="text-slate-700">{getVolunteerCode()}</strong>
            </div>
            <div>
              Sincronización API: <span className="text-sky-600 font-medium">Same-Origin (Rest)</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Share Button (FAB) */}
      <button
        onClick={() => {
          if (navigator.share) {
            navigator.share({
              title: "Cuídarte Venezuela",
              text: "Revisa la última actualización de la situación del sismo en Venezuela.",
              url: window.location.href,
            }).catch(err => console.warn("Web Share failed:", err));
          } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(window.location.href).then(() => {
              alert("Enlace copiado al portapapeles");
            });
          }
        }}
        className="
          fixed bottom-4 right-4
          z-50
          h-10 w-10
          rounded-full
          bg-sky-600 hover:bg-sky-700
          text-white
          shadow-lg
          flex items-center justify-center
          transition-transform duration-200
          hover:scale-105
        "
        aria-label="Compartir"
      >
        <Share className="h-5 w-5" />
      </button>

      {/* Toast notification system */}
      {toastMsg && (
        <div id="toast-message" className="fixed top-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-4 py-3 rounded-2xl text-xs font-semibold shadow-2xl flex items-center gap-2 z-50 animate-bounce max-w-sm w-[90vw] text-center border border-rose-400">
          <AlertCircle className="w-3.5 h-3.5 text-white shrink-0" />
          <span className="flex-1">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}