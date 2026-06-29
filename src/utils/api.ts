/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hospital, Paciente, Transporte, DedupReport } from "../types";

let API_BASE = "/api";
let detectedIP = "0.0.0.0";
let volunteerCode = "";

// Initialize volunteer code from session storage if it exists
if (typeof window !== "undefined") {
  volunteerCode = sessionStorage.getItem("codigo_voluntario") || "";
}

// Fetch the IP address at startup
export async function detectIPAddress(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (res.ok) {
      const data = await res.json();
      detectedIP = data.ip || "0.0.0.0";
    }
  } catch (err) {
    console.warn("Error detectando IP, usando local/0.0.0.0:", err);
    detectedIP = "127.0.0.1";
  }
  return detectedIP;
}

export function getDetectedIP(): string {
  return detectedIP;
}

export function setVolunteerCode(code: string) {
  volunteerCode = code;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("codigo_voluntario", code);
  }
}

export function getVolunteerCode(): string {
  return volunteerCode;
}

export function isAuthorized(): boolean {
  return volunteerCode.trim().length >= 4; // Numeric volunteer code (at least 4 digits)
}

// Dynamically fetch config
export async function initializeAPI(): Promise<string> {
  try {
    const res = await fetch("./config.json");
    if (res.ok) {
      const config = await res.json();
      API_BASE = config.api_base || "/api";
    }
  } catch (err) {
    console.log("No config.json found or failed to load. Defaulting to /api");
    API_BASE = "/api";
  }
  await detectIPAddress();
  return API_BASE;
}

export function getAPIBase(): string {
  return API_BASE;
}

// ==========================================
// SEED INITIAL MOCK DATA (stored in LocalStorage for demo & offline preview)
// ==========================================
const MOCK_HOSPITALES: Hospital[] = [
  { id: 1, nombre: "Hospital Universitario de Caracas (HUC)", municipio: "Libertador", estado: "Distrito Capital", telefono: "+58 212-6067111" },
  { id: 2, nombre: "Hospital J.M. de los Ríos", municipio: "Libertador", estado: "Distrito Capital", telefono: "+58 212-5743511" },
  { id: 3, nombre: "Hospital Domingo Luciani", municipio: "Sucre", estado: "Miranda", telefono: "+58 212-2561111" },
  { id: 4, nombre: "Hospital Dr. Miguel Pérez Carreño", municipio: "Libertador", estado: "Distrito Capital", telefono: "+58 212-4422311" },
  { id: 5, nombre: "Hospital Central de Maracay", municipio: "Girardot", estado: "Aragua", telefono: "+58 243-2465111" },
  { id: 6, nombre: "Hospital Central de Valencia", municipio: "Valencia", estado: "Carabobo", telefono: "+58 241-8711111" },
];

const MOCK_PACIENTES: Paciente[] = [
  { id: 101, nombre: "Carlos Eduardo Mendoza", edad: 42, sexo: "Masculino", hospital: "Hospital Universitario de Caracas (HUC)", hospital_id: 1, ingreso_fecha: "2026-06-25", estado: "hospitalizado", posible_duplicado: false, cedula_masked: "V-15.***.341", cedula: "15341256", procedencia: "La Vega, Caracas" },
  { id: 102, nombre: "María Alejandra Rivas", edad: 29, sexo: "Femenino", hospital: "Hospital Domingo Luciani", hospital_id: 3, ingreso_fecha: "2026-06-26", estado: "hospitalizado", posible_duplicado: false, cedula_masked: "V-21.***.908", cedula: "21908332", procedencia: "Petare, Miranda" },
  { id: 103, nombre: "José Gregorio Hernández", edad: 67, sexo: "Masculino", hospital: "Hospital J.M. de los Ríos", hospital_id: 2, ingreso_fecha: "2026-06-25", estado: "referido", posible_duplicado: false, cedula_masked: "V-8.***.112", cedula: "8112345", procedencia: "Antímano, Caracas" },
  { id: 104, nombre: "Carmen Elena Uzcátegui", edad: 75, sexo: "Femenino", hospital: "Hospital Universitario de Caracas (HUC)", hospital_id: 1, ingreso_fecha: "2026-06-24", estado: "alta", posible_duplicado: false, cedula_masked: "V-4.***.781", cedula: "4781992", procedencia: "El Valle, Caracas" },
  { id: 105, nombre: "Luis Alejandro Blanco", edad: 16, sexo: "Masculino", hospital: "Hospital Dr. Miguel Pérez Carreño", hospital_id: 4, ingreso_fecha: "2026-06-27", estado: "hospitalizado", posible_duplicado: true, cedula_masked: "V-30.***.554", cedula: "30554122", procedencia: "Chacao, Miranda" },
];

const MOCK_TRANSPORTE: Transporte[] = [
  { id: 1, nombre: "Juan Carlos Altuve", telefono: "0412-5551234", ciudad: "Caracas", vehiculo: "Toyota Hilux 4x4", capacidad_personas: 5, capacidad_carga: "800 kg (Pick-up)", disponible: true, notas: "Disponible para traslado rústico y zonas de difícil acceso.", cedula: "12345" },
  { id: 2, nombre: "Génesis Mireya Pérez", telefono: "0424-9987744", ciudad: "Maracay", vehiculo: "Chevrolet Silverado 1500", capacidad_personas: 3, capacidad_carga: "1000 kg (Carga pesada)", disponible: true, notas: "Apoyo con transporte de cajas de agua, insumos médicos y medicinas.", cedula: "23456" },
  { id: 3, nombre: "Pedro Rafael Castillo", telefono: "0414-3321155", ciudad: "Valencia", vehiculo: "Ford Transit Ambulancia Privada", capacidad_personas: 2, capacidad_carga: "Soportes de camilla", disponible: false, notas: "Actualmente en ruta con traslado programado. Libre en la noche.", cedula: "34567" },
  { id: 4, nombre: "Dr. Marcos Salazar", telefono: "0416-7788990", ciudad: "Caracas", vehiculo: "Ambulancia Soporte Básico", capacidad_personas: 3, capacidad_carga: "Equipos médicos", disponible: true, notas: "Equipada con oxígeno de emergencia. Zona este.", cedula: "45678" }
];

// Load local databases or seed them
function getLocalDB<T>(key: string, seed: T[]): T[] {
  if (typeof window === "undefined") return seed;
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(data);
  } catch {
    return seed;
  }
}

function saveLocalDB<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// Fetch helper that falls back to localStorage mock DB if request fails
async function fetchWithMockFallback<T>(
  url: string,
  options: RequestInit,
  mockKey: string,
  mockSeed: T[],
  mockHandler: (localData: T[]) => { ok: boolean; data?: any; id?: number; resultados?: any }
): Promise<{ ok: boolean; [key: string]: any }> {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  } as Record<string, string>;

  if (volunteerCode) {
    headers["X-Codigo-Voluntario"] = volunteerCode;
  }

  // Debug log all API calls for auditing purposes
  console.log(`[API CALL] ${options.method || "GET"} ${url}`, {
    headers,
    body: options.body ? JSON.parse(options.body as string) : null,
  });

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.ok) {
      const serverData = await res.json();
      return serverData;
    }
    throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    console.warn(`API ${url} failed, falling back to LocalStorage Mock DB. Error:`, err);
    const localData = getLocalDB<T>(mockKey, mockSeed);
    const result = mockHandler(localData);
    saveLocalDB(mockKey, localData);
    return result;
  }
}

// ==========================================
// API IMPLEMENTATIONS WITH LIVE/MOCK SYNC
// ==========================================

export async function getHospitales(): Promise<Hospital[]> {
  const result = await fetchWithMockFallback<Hospital>(
    `${API_BASE}/hospitales.php`,
    { method: "GET" },
    "cuidarte_hospitales",
    MOCK_HOSPITALES,
    (local) => ({ ok: true, data: local })
  );
  return result.data || [];
}

export async function searchPacientes(q: string = ""): Promise<Paciente[]> {
  const queryParam = q ? `?q=${encodeURIComponent(q)}` : "";
  const result = await fetchWithMockFallback<Paciente>(
    `${API_BASE}/pacientes.php${queryParam}`,
    { method: "GET" },
    "cuidarte_pacientes",
    MOCK_PACIENTES,
    (local) => {
      if (!q) return { ok: true, data: local };
      const lowerQ = q.toLowerCase();
      const filtered = local.filter(
        (p) =>
          p.nombre.toLowerCase().includes(lowerQ) ||
          (p.cedula && p.cedula.includes(lowerQ)) ||
          p.hospital.toLowerCase().includes(lowerQ)
      );
      return { ok: true, data: filtered };
    }
  );
  return result.data || [];
}

export async function createPaciente(payload: {
  nombre: string;
  cedula?: string;
  edad?: number;
  sexo: "Masculino" | "Femenino" | "Desconocido";
  procedencia?: string;
  hospital_id?: number | null;
  hospital_nuevo?: string;
  ingreso_fecha?: string;
  estado?: string;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const bodyPayload = {
    ...payload,
    ip_registro: detectedIP,
  };

  const result = await fetchWithMockFallback<Paciente>(
    `${API_BASE}/pacientes.php`,
    {
      method: "POST",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_pacientes",
    MOCK_PACIENTES,
    (local) => {
      // Find hospital name
      const hospitals = getLocalDB<Hospital>("cuidarte_hospitales", MOCK_HOSPITALES);
      const matchedHosp = hospitals.find((h) => h.id === payload.hospital_id);
      const hospitalName = matchedHosp ? matchedHosp.nombre : (payload.hospital_nuevo || "Desconocido");

      // Check duplicate
      const isDupe = local.some(
        (p) =>
          (payload.cedula && p.cedula === payload.cedula) ||
          p.nombre.toLowerCase().trim() === payload.nombre.toLowerCase().trim()
      );

      const maskedCedula = payload.cedula
        ? `V-${payload.cedula.slice(0, Math.max(0, payload.cedula.length - 3))}.***.${payload.cedula.slice(-3)}`
        : null;

      const newId = local.length > 0 ? Math.max(...local.map((p) => p.id)) + 1 : 1000;
      const newPatient: Paciente = {
        id: newId,
        nombre: payload.nombre,
        cedula: payload.cedula,
        edad: payload.edad || null,
        sexo: payload.sexo,
        hospital: hospitalName,
        hospital_id: payload.hospital_id || null,
        ingreso_fecha: payload.ingreso_fecha || new Date().toISOString().split("T")[0],
        estado: payload.estado || "hospitalizado",
        posible_duplicado: isDupe,
        cedula_masked: maskedCedula,
        procedencia: payload.procedencia,
      };

      local.push(newPatient);
      return { ok: true, id: newId };
    }
  );

  return result;
}

export async function updatePaciente(
  id: number,
  payload: {
    estado?: string;
    nombre?: string;
    cedula?: string;
    edad?: number;
    sexo?: "Masculino" | "Femenino" | "Desconocido";
    procedencia?: string;
    hospital_id?: number | null;
    ingreso_fecha?: string;
  }
): Promise<{ ok: boolean }> {
  const bodyPayload = {
    ...payload,
    ip_registro: detectedIP,
  };

  const result = await fetchWithMockFallback<Paciente>(
    `${API_BASE}/pacientes.php?id=${id}`,
    {
      method: "PUT",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_pacientes",
    MOCK_PACIENTES,
    (local) => {
      const idx = local.findIndex((p) => p.id === id);
      if (idx !== -1) {
        const hospitals = getLocalDB<Hospital>("cuidarte_hospitales", MOCK_HOSPITALES);
        let hospitalName = local[idx].hospital;
        if (payload.hospital_id !== undefined) {
          const matchedHosp = hospitals.find((h) => h.id === payload.hospital_id);
          hospitalName = matchedHosp ? matchedHosp.nombre : "Desconocido";
        }

        const maskedCedula = payload.cedula
          ? `V-${payload.cedula.slice(0, Math.max(0, payload.cedula.length - 3))}.***.${payload.cedula.slice(-3)}`
          : local[idx].cedula_masked;

        local[idx] = {
          ...local[idx],
          ...(payload.nombre && { nombre: payload.nombre }),
          ...(payload.cedula !== undefined && { cedula: payload.cedula, cedula_masked: maskedCedula }),
          ...(payload.edad !== undefined && { edad: payload.edad }),
          ...(payload.sexo && { sexo: payload.sexo }),
          ...(payload.procedencia !== undefined && { procedencia: payload.procedencia }),
          ...(payload.hospital_id !== undefined && { hospital_id: payload.hospital_id, hospital: hospitalName }),
          ...(payload.ingreso_fecha !== undefined && { ingreso_fecha: payload.ingreso_fecha }),
          ...(payload.estado !== undefined && { estado: payload.estado }),
        };
        return { ok: true };
      }
      return { ok: false };
    }
  );

  return { ok: result.ok };
}

export async function postPacientesLote(payload: {
  hospital_id?: number | null;
  hospital_nuevo?: string;
  ingreso_fecha?: string;
  pacientes: {
    nombre: string;
    cedula?: string;
    edad?: number;
    sexo: "Masculino" | "Femenino" | "Desconocido";
    procedencia?: string;
  }[];
  updateOnDuplicate?: boolean; // Front-end custom parameter to decide overwrite/merge
}): Promise<{ ok: boolean; resultados: any[] }> {
  const bodyPayload = {
    hospital_id: payload.hospital_id,
    hospital_nuevo: payload.hospital_nuevo,
    ingreso_fecha: payload.ingreso_fecha,
    ip_registro: detectedIP,
    pacientes: payload.pacientes,
  };

  const result = await fetchWithMockFallback<Paciente>(
    `${API_BASE}/pacientes_lote.php`,
    {
      method: "POST",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_pacientes",
    MOCK_PACIENTES,
    (local) => {
      const hospitals = getLocalDB<Hospital>("cuidarte_hospitales", MOCK_HOSPITALES);
      const matchedHosp = hospitals.find((h) => h.id === payload.hospital_id);
      const hospitalName = matchedHosp ? matchedHosp.nombre : (payload.hospital_nuevo || "Desconocido");

      const resultados = payload.pacientes.map((p, index) => {
        // Check duplicate in existing list
        const existingIdx = local.findIndex(
          (ep) =>
            (p.cedula && ep.cedula === p.cedula) ||
            ep.nombre.toLowerCase().trim() === p.nombre.toLowerCase().trim()
        );

        const maskedCedula = p.cedula
          ? `V-${p.cedula.slice(0, Math.max(0, p.cedula.length - 3))}.***.${p.cedula.slice(-3)}`
          : null;

        if (existingIdx !== -1) {
          if (payload.updateOnDuplicate) {
            // Overwrite/update existing record
            local[existingIdx] = {
              ...local[existingIdx],
              nombre: p.nombre,
              edad: p.edad || local[existingIdx].edad,
              sexo: p.sexo,
              procedencia: p.procedencia || local[existingIdx].procedencia,
              hospital: hospitalName,
              hospital_id: payload.hospital_id || null,
              ingreso_fecha: payload.ingreso_fecha || new Date().toISOString().split("T")[0],
              estado: "hospitalizado", // re-admitted or checked in
              posible_duplicado: false,
              cedula_masked: maskedCedula,
            };
            return { fila: index + 1, status: "actualizado" as const, id: local[existingIdx].id };
          } else {
            // Duplicate detected, return status duplicado
            return { fila: index + 1, status: "duplicado" as const, motivo: "Cédula o Nombre ya registrado en el hospital." };
          }
        }

        // Create new patient
        const newId = local.length > 0 ? Math.max(...local.map((lp) => lp.id)) + 1 : 1000;
        const newPatient: Paciente = {
          id: newId,
          nombre: p.nombre,
          cedula: p.cedula,
          edad: p.edad || null,
          sexo: p.sexo,
          hospital: hospitalName,
          hospital_id: payload.hospital_id || null,
          ingreso_fecha: payload.ingreso_fecha || new Date().toISOString().split("T")[0],
          estado: "hospitalizado",
          posible_duplicado: false,
          cedula_masked: maskedCedula,
          procedencia: p.procedencia,
        };

        local.push(newPatient);
        return { fila: index + 1, status: "creado" as const, id: newId };
      });

      return { ok: true, resultados };
    }
  );

  return {
    ok: result.ok,
    resultados: result.resultados || [],
  };
}

/**
 * Envía pacientes al motor de deduplicación (nuevo endpoint inteligente).
 * Soporta tanto paciente individual como lotes. Detecta duplicados con dos niveles:
 * cédula exacta + fuzzy (nombre/hospital/edad) y enriquece registros existentes.
 * 
 * @returns DedupReport con conteo de nuevos, mergeados, sin_cambios, errores
 */
export async function deduplicatePacientes(payload: {
  fuente?: string;
  hospital_id?: number | null;
  hospital_nuevo?: string;
  ingreso_fecha?: string;
  pacientes: {
    nombre: string;
    cedula?: string;
    edad?: number;
    sexo: "Masculino" | "Femenino" | "Desconocido";
    procedencia?: string;
    estado?: string;
  }[];
}): Promise<DedupReport> {
  const bodyPayload = {
    fuente: payload.fuente || "admin_web",
    hospital_id: payload.hospital_id,
    hospital_nuevo: payload.hospital_nuevo,
    ingreso_fecha: payload.ingreso_fecha,
    pacientes: payload.pacientes,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (volunteerCode) {
    headers["X-Codigo-Voluntario"] = volunteerCode;
  }

  console.log("[API CALL] POST /deduplicate.php", {
    pacientesCount: payload.pacientes.length,
  });

  try {
    const res = await fetch(`${API_BASE}/deduplicate.php`, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
    });

    if (res.ok) {
      const data = await res.json();
      return data as DedupReport;
    }

    const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errorData.error || `Error del servidor (${res.status})`);
  } catch (err: any) {
    console.error("[Dedup] Error:", err);
    // Fallback: retornar un reporte de error
    return {
      ok: false,
      total_recibidos: payload.pacientes.length,
      nuevos: 0,
      mergeados: 0,
      sin_cambios: 0,
      errores: payload.pacientes.length,
      detalle: payload.pacientes.map((p, i) => ({
        fila: i + 1,
        nombre: p.nombre,
        accion: "error" as const,
        id: 0,
        motivo: err.message || "Error de conexión",
      })),
    };
  }
}

export async function getTransportes(): Promise<Transporte[]> {
  const result = await fetchWithMockFallback<Transporte>(
    `${API_BASE}/transporte.php`,
    { method: "GET" },
    "cuidarte_transporte",
    MOCK_TRANSPORTE,
    (local) => ({ ok: true, data: local })
  );
  return result.data || [];
}

export async function createTransporte(payload: {
  nombre: string;
  telefono: string;
  ciudad: string;
  vehiculo: string;
  capacidad_personas: number;
  capacidad_carga: string;
  notas?: string;
  cedula: string; // PIN de seguridad
}): Promise<{ ok: boolean; data?: Transporte }> {
  const bodyPayload = {
    ...payload,
    ip_registro: detectedIP,
  };

  const result = await fetchWithMockFallback<Transporte>(
    `${API_BASE}/transporte.php`,
    {
      method: "POST",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_transporte",
    MOCK_TRANSPORTE,
    (local) => {
      const newId = local.length > 0 ? Math.max(...local.map((t) => t.id)) + 1 : 1;
      const newT: Transporte = {
        id: newId,
        nombre: payload.nombre,
        telefono: payload.telefono,
        ciudad: payload.ciudad,
        vehiculo: payload.vehiculo,
        capacidad_personas: payload.capacidad_personas,
        capacidad_carga: payload.capacidad_carga,
        disponible: true,
        notas: payload.notas || null,
        cedula: payload.cedula,
      };
      local.push(newT);
      return { ok: true, data: newT };
    }
  );

  return {
    ok: result.ok,
    data: result.data,
  };
}

export async function updateTransporte(payload: {
  id: number;
  cedula: string;
  disponible?: boolean;
  nombre?: string;
  telefono?: string;
  ciudad?: string;
  vehiculo?: string;
  capacidad_personas?: number;
  capacidad_carga?: string;
  notas?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const bodyPayload = {
    ...payload,
    ip_registro: detectedIP,
  };

  const result = await fetchWithMockFallback<Transporte>(
    `${API_BASE}/transporte.php`,
    {
      method: "PUT",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_transporte",
    MOCK_TRANSPORTE,
    (local) => {
      const idx = local.findIndex((t) => t.id === payload.id);
      if (idx === -1) {
        return { ok: false, error: "Recurso no encontrado" };
      }
      // Security Validation of Cédula PIN
      if (local[idx].cedula !== payload.cedula) {
        return { ok: false, error: "Cédula/PIN incorrecto. No autorizado para modificar este recurso." };
      }

      local[idx] = {
        ...local[idx],
        ...(payload.disponible !== undefined && { disponible: payload.disponible }),
        ...(payload.nombre && { nombre: payload.nombre }),
        ...(payload.telefono && { telefono: payload.telefono }),
        ...(payload.ciudad && { ciudad: payload.ciudad }),
        ...(payload.vehiculo && { vehiculo: payload.vehiculo }),
        ...(payload.capacidad_personas !== undefined && { capacidad_personas: payload.capacidad_personas }),
        ...(payload.capacidad_carga !== undefined && { capacidad_carga: payload.capacidad_carga }),
        ...(payload.notas !== undefined && { notas: payload.notas }),
      };
      return { ok: true };
    }
  );

  return {
    ok: result.ok,
    error: result.error,
  };
}

export async function deleteTransporte(id: number, cedula: string): Promise<{ ok: boolean; error?: string }> {
  const bodyPayload = {
    id,
    cedula,
    ip_registro: detectedIP,
  };

  const result = await fetchWithMockFallback<Transporte>(
    `${API_BASE}/transporte.php`,
    {
      method: "DELETE",
      body: JSON.stringify(bodyPayload),
    },
    "cuidarte_transporte",
    MOCK_TRANSPORTE,
    (local) => {
      const idx = local.findIndex((t) => t.id === id);
      if (idx === -1) {
        return { ok: false, error: "Recurso no encontrado" };
      }
      if (local[idx].cedula !== cedula) {
        return { ok: false, error: "Cédula/PIN incorrecto. No autorizado para eliminar este recurso." };
      }
      local.splice(idx, 1);
      return { ok: true };
    }
  );

  return {
    ok: result.ok,
    error: result.error,
  };
}
