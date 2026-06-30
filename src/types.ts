/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Hospital {
  id: number;
  nombre: string;
  municipio: string;
  estado: string;
  telefono: string | null;
}

export interface Paciente {
  id: number;
  nombre: string;
  edad: number | null;
  sexo: "Masculino" | "Femenino" | "Desconocido";
  hospital: string;
  hospital_id: number | null;
  ingreso_fecha: string | null;
  estado: string; // e.g. "alta", "referido", "fallecido", "hospitalizado"
  posible_duplicado: boolean;
  cedula_masked: string | null;
  cedula?: string;
  procedencia?: string;
  carga_id?: number | null;
  carga_secuencial?: number | null;
}

export interface Transporte {
  id: number;
  nombre: string;
  telefono: string;
  ciudad: string;
  vehiculo: string;
  capacidad_personas: number;
  capacidad_carga: string;
  disponible: boolean;
  notas?: string | null;
  cedula?: string; // Used as security PIN
}

export interface Alerta {
  id: string;
  texto: string;
  severidad: "baja" | "media" | "alta" | "critica";
  timestamp: string;
  voluntario: string;
}

export interface ParsedPaciente {
  id_temporal: string;
  nombre: string;
  cedula?: string;
  edad?: number;
  sexo: "Masculino" | "Femenino" | "Desconocido";
  procedencia?: string;
  estado?: string;                     // hospitalizado, alta, referido, fallecido, etc.
  confianza_ocr?: number;
  status_verificacion?: "pendiente" | "validado" | "duplicado";
  motivo_duplicado?: string;
}

export interface LoteResultado {
  fila: number;
  status: "creado" | "duplicado" | "error" | "actualizado";
  id?: number;
  motivo?: string;
}

/** Reporte del motor de deduplicación */
export interface DedupDetail {
  fila: number;
  nombre: string;
  accion: "nuevo" | "merge" | "sin_cambios" | "error";
  id: number;
  match_tipo?: "cedula" | "fuzzy";
  campos_agregados?: string[];
  motivo?: string;
}

export interface DedupReport {
  ok: boolean;
  total_recibidos: number;
  nuevos: number;
  mergeados: number;
  sin_cambios: number;
  errores: number;
  carga_id?: number;
  detalle: DedupDetail[];
}
