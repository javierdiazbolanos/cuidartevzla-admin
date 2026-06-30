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
 * Decide si se debe usar fallback LLM basado en múltiples heurísticas:
 * 
 * Reglas (cualquiera dispara LLM):
 *   1. 0 pacientes → SIEMPRE intentar LLM
 *   2. Confianza promedio < 75% (bajado de 85%, Tesseract infla confianza en español)
 *   3. Algún nombre con signos de truncamiento (última palabra 1-2 letras)
 *   4. >30% de nombres parecen basura OCR (consonantes sin vocales)
 *   5. < 3 pacientes extraídos de una página que debería tener varios
 *   6. Algún nombre contiene secuencias de consonantes imposibles (ej: "VLLGS")
 *
 * NOTA: Ya NO depende de API key frontend — el backend maneja eso.
 */
export function shouldUseLLMFallback(patients: ParsedPaciente[]): boolean {
  // Regla 1: Si Tesseract no encontró nada en absoluto
  if (patients.length === 0) return true;

  const avgConf = avgBatchConfidence(patients);

  // Regla 2: Confianza promedio baja (umbral más agresivo — 75% en vez de 85%)
  if (avgConf < 75) return true;

  // Regla 3: Detectar nombres truncados (última palabra de 1-2 caracteres)
  //    Ej: "VILLEGAS VILLAMAR BRAYAN JO" → "JO" es truncamiento de "JOSE"
  const truncatedCount = patients.filter((p) => hasTruncatedName(p.nombre)).length;
  if (truncatedCount > 0) return true;

  // Regla 4: Calidad de nombres sospechosa (>30% son basura)
  const garbageCount = patients.filter((p) => isLikelyOCRGarbage(p.nombre)).length;
  if (garbageCount > patients.length * 0.3) return true;

  // Regla 5: Muy pocos pacientes para una página
  if (patients.length < 3) return true;

  // Regla 6: Algún nombre contiene secuencias de 4+ consonantes (imposible en español)
  const hasImpossibleCluster = patients.some((p) => {
    const cleaned = p.nombre.replace(/\s/g, "");
    return /[BCDFGHJKLMNPQRSTVWXYZ]{4,}/i.test(cleaned);
  });
  if (hasImpossibleCluster) return true;

  return false;
}

/**
 * Detecta si un nombre tiene su última palabra truncada (1-2 caracteres).
 * "VILLEGAS VILLAMAR BRAYAN JO" → true (última palabra "JO")
 * "VILCHEZ VILLALOBOS BRAYAN JOSE" → false
 */
function hasTruncatedName(name: string): boolean {
  if (!name || name.length < 3) return false;
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  const lastToken = tokens[tokens.length - 1];
  // Última palabra de 1-2 caracteres Y hay al menos 2 palabras más → truncamiento
  return lastToken.length <= 2 && tokens.length >= 3;
}

/**
 * Detecta si un nombre extraído por OCR probablemente es basura.
 * Mejorado: ahora también detecta clusters de 3+ consonantes consecutivas
 * y nombres con ratio vocal/consonante invertido.
 */
function isLikelyOCRGarbage(name: string): boolean {
  if (!name || name.length < 3) return true;
  const cleaned = name.replace(/\s/g, "");
  const vowels = (cleaned.match(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g) || []).length;
  const ratio = vowels / cleaned.length;
  
  // Menos del 20% de vocales en > 4 letras
  if (ratio < 0.2 && cleaned.length > 4) return true;
  
  // Clusters de 3+ consonantes en una palabra (ej: "VLLG" en "VLLEGAS")
  const words = name.split(/\s+/);
  for (const word of words) {
    if (/[BCDFGHJKLMNPQRSTVWXYZ]{3,}/i.test(word)) return true;
  }
  
  return false;
}
