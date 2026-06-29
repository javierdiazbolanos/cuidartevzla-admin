/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LLM Fallback OCR via backend proxy (procesar_con_llm.php)
 * Se activa cuando Tesseract.js tiene baja confianza o detecta 0 pacientes.
 * La API key de OpenRouter NUNCA se expone al frontend.
 */

import { ParsedPaciente } from "../types";
import { getVolunteerCode, getAPIBase } from "./api";

/**
 * Envía una imagen (canvas) al backend proxy que llama a Gemini Flash vía OpenRouter.
 * Retorna un array de ParsedPaciente con los datos estructurados.
 */
export async function llmOCRPage(
  canvas: HTMLCanvasElement,
  pageNum: number,
  onProgress?: (msg: string) => void
): Promise<ParsedPaciente[]> {
  onProgress?.(`Enviando página ${pageNum} a Gemini Flash vía backend...`);

  const base64Image = canvas.toDataURL("image/png");
  const imageSizeKB = Math.round(base64Image.length * 0.75 / 1024);
  console.log(
    `[LLM Proxy] Enviando página ${pageNum} al backend — imagen ${imageSizeKB}KB — canvas ${canvas.width}x${canvas.height}`
  );

  const API_BASE = getAPIBase();
  const volunteerCode = getVolunteerCode();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (volunteerCode) {
    headers["X-Codigo-Voluntario"] = volunteerCode;
  }

  try {
    const response = await fetch(`${API_BASE}/procesar_con_llm.php`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image: base64Image,
        page_num: pageNum,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[LLM Proxy] Backend error ${response.status}:`, errText);
      return [];
    }

    const data = await response.json();

    if (!data.ok) {
      console.error("[LLM Proxy] Backend retornó error:", data.error);
      return [];
    }

    onProgress?.(`Procesando respuesta de IA para página ${pageNum}...`);

    const rawPatients = data.pacientes || [];
    if (rawPatients.length === 0) {
      console.warn("[LLM Proxy] Backend retornó 0 pacientes.");
      return [];
    }

    const parsed: ParsedPaciente[] = [];
    for (const p of rawPatients) {
      const nombre = String(p.nombre || "").trim();
      if (!nombre || nombre.length < 3) continue;

      // Mapear sexo
      const sexoRaw = String(p.sexo || "").toLowerCase().trim();
      let mappedSexo: "Masculino" | "Femenino" | "Desconocido" = "Desconocido";
      if (/^m(asc)?(ulino)?|h(ombre)?|varon|varón/.test(sexoRaw)) mappedSexo = "Masculino";
      else if (/^f(em)?(enino)?|m(ujer)?|hembra/.test(sexoRaw)) mappedSexo = "Femenino";

      // Limpiar cédula
      const cedula = String(p.cedula || "").replace(/\D/g, "");

      // Edad
      const edadRaw = parseInt(String(p.edad || ""), 10);
      const edad = !isNaN(edadRaw) && edadRaw > 0 && edadRaw <= 120 ? edadRaw : undefined;

      const procedencia = String(p.procedencia || "").trim();

      parsed.push({
        id_temporal: `llm-${pageNum}-${Math.random().toString(36).substring(2, 7)}`,
        nombre,
        cedula: cedula || undefined,
        edad,
        sexo: mappedSexo,
        procedencia: procedencia || undefined,
        confianza_ocr: p.confianza_ocr || 85,
        status_verificacion: "pendiente",
      });
    }

    console.log(`[LLM Proxy] ${parsed.length} pacientes extraídos de página ${pageNum}`);
    return parsed;
  } catch (err) {
    console.error("[LLM Proxy] Error de red:", err);
    return [];
  }
}

/**
 * Calcula la confianza promedio de un lote de pacientes
 */
export function avgBatchConfidence(patients: ParsedPaciente[]): number {
  if (patients.length === 0) return 0;
  const sum = patients.reduce((acc, p) => acc + (p.confianza_ocr || 0), 0);
  return Math.round(sum / patients.length);
}

/**
 * Decide si se debe usar fallback LLM basado en:
 * - 0 pacientes detectados por Tesseract → SIEMPRE intentar LLM
 * - Confianza promedio < 85% (umbral alto porque Tesseract sobrestima en español)
 * - Nombres con calidad sospechosa (>40% parecen basura OCR)
 * - Muy pocos pacientes extraídos (< 3)
 *
 * NOTA: Ya NO depende de API key frontend — el backend maneja eso.
 */
export function shouldUseLLMFallback(patients: ParsedPaciente[]): boolean {
  // Si Tesseract no encontró nada en absoluto, intentar LLM
  if (patients.length === 0) return true;

  const avgConf = avgBatchConfidence(patients);

  // Regla 1: Confianza promedio baja
  if (avgConf < 85) return true;

  // Regla 2: Calidad de nombres sospechosa (>40% son basura)
  const garbageCount = patients.filter((p) => isLikelyOCRGarbage(p.nombre)).length;
  if (garbageCount > patients.length * 0.4) return true;

  // Regla 3: Muy pocos pacientes para una página que debería tener varios
  if (patients.length < 3) return true;

  return false;
}

/**
 * Detecta si un nombre extraído por OCR probablemente es basura
 * (consonantes sin vocales, texto sin sentido)
 */
function isLikelyOCRGarbage(name: string): boolean {
  if (!name || name.length < 3) return true;
  const cleaned = name.replace(/\s/g, "");
  const vowels = (cleaned.match(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g) || []).length;
  const ratio = vowels / cleaned.length;
  // Menos del 20% de vocales en un nombre > 4 letras = basura
  return ratio < 0.2 && cleaned.length > 4;
}
