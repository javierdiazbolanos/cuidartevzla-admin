/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LLM Fallback OCR via OpenRouter
 * Se activa cuando Tesseract.js tiene baja confianza (< 70%)
 * Usa Google Gemini 2.0 Flash: excelente visión, bajísimo costo (~$0.00015/página)
 */

import { ParsedPaciente } from "../types";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const LLM_MODEL = "google/gemini-2.0-flash-001";

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: { message: string };
}

/**
 * Envía una imagen (canvas) a Gemini vía OpenRouter para extraer datos de pacientes
 * Retorna un array de ParsedPaciente con los datos estructurados
 */
export async function llmOCRPage(
  canvas: HTMLCanvasElement,
  pageNum: number,
  onProgress?: (msg: string) => void
): Promise<ParsedPaciente[]> {
  if (!OPENROUTER_API_KEY) {
    console.warn("⚠️ VITE_OPENROUTER_API_KEY no configurada. Saltando fallback LLM.");
    return [];
  }

  onProgress?.(`Enviando página ${pageNum} a Gemini Flash (OpenRouter)...`);

  const base64Image = canvas.toDataURL("image/png").split(",")[1];

  const prompt = `Eres un sistema de OCR médico de emergencia. Extrae TODOS los pacientes de esta imagen escaneada de una lista hospitalaria venezolana.

La imagen puede estar borrosa o tener baja calidad. Haz tu mejor esfuerzo para leer cada fila.

Reglas:
- Extrae: nombre completo, cédula (solo dígitos), edad, sexo (Masculino/Femenino), procedencia
- Si un campo no se puede leer, déjalo vacío ""
- NO inventes datos. Si no puedes leer algo, déjalo en blanco.
- Ignora filas de encabezado (como "Nombre", "Cédula", "Edad")
- Devuelve ÚNICAMENTE un array JSON válido, sin markdown, sin explicaciones.

Formato de salida:
[
  {
    "nombre": "PEREZ GONZALEZ JUAN CARLOS",
    "cedula": "12345678",
    "edad": 34,
    "sexo": "Masculino",
    "procedencia": "La Guaira"
  }
]`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "CuidarteVzla OCR",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1, // Baja temperatura = más preciso para OCR
        response_format: { type: "json_object" }, // Forzar JSON si el modelo lo soporta
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OpenRouter error ${response.status}:`, errText);
      return [];
    }

    const data: OpenRouterResponse = await response.json();

    if (data.error) {
      console.error("OpenRouter API error:", data.error.message);
      return [];
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("Respuesta vacía de LLM");
      return [];
    }

    onProgress?.(`Procesando respuesta de IA para página ${pageNum}...`);

    // Extraer el JSON (puede venir con markdown ```json ... ```)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\[[\s\S]*\])/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

    let rawPatients: any[];
    try {
      rawPatients = JSON.parse(jsonStr);
    } catch {
      // Segundo intento: el modelo puede haber devuelto un objeto con key "pacientes"
      try {
        const obj = JSON.parse(jsonStr);
        rawPatients = obj.pacientes || obj.data || obj.rows || [];
      } catch {
        console.error("No se pudo parsear la respuesta JSON del LLM:", jsonStr.substring(0, 200));
        return [];
      }
    }

    if (!Array.isArray(rawPatients) || rawPatients.length === 0) {
      return [];
    }

    const parsed: ParsedPaciente[] = [];
    for (const p of rawPatients) {
      const nombre = String(p.nombre || p.nombre_completo || p.name || "").trim();
      if (!nombre || nombre.length < 3) continue;

      // Mapear sexo
      const sexoRaw = String(p.sexo || p.sex || p.genero || p.gender || "").toLowerCase().trim();
      let mappedSexo: "Masculino" | "Femenino" | "Desconocido" = "Desconocido";
      if (/^m(asc)?(ulino)?|h(ombre)?|varon|varón/.test(sexoRaw)) mappedSexo = "Masculino";
      else if (/^f(em)?(enino)?|m(ujer)?|hembra/.test(sexoRaw)) mappedSexo = "Femenino";

      // Limpiar cédula
      const cedula = String(p.cedula || p.ci || p.id || p.documento || "").replace(/\D/g, "");

      // Edad
      const edadRaw = parseInt(String(p.edad || p.age || ""), 10);
      const edad = !isNaN(edadRaw) && edadRaw > 0 && edadRaw <= 120 ? edadRaw : undefined;

      const procedencia = String(p.procedencia || p.origen || p.procedence || p.origin || "").trim();

      parsed.push({
        id_temporal: `llm-${pageNum}-${Math.random().toString(36).substring(2, 7)}`,
        nombre,
        cedula: cedula || undefined,
        edad,
        sexo: mappedSexo,
        procedencia: procedencia || undefined,
        confianza_ocr: 85, // Gemini Flash suele tener buena precisión en OCR
        status_verificacion: "pendiente",
      });
    }

    return parsed;
  } catch (err) {
    console.error("Error en llmOCRPage:", err);
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
 * - Confianza promedio < 70%
 * - Hay API key configurada
 */
export function shouldUseLLMFallback(patients: ParsedPaciente[]): boolean {
  if (!OPENROUTER_API_KEY) return false;
  if (patients.length === 0) return true; // Tesseract no encontró nada → intentar LLM
  return avgBatchConfidence(patients) < 70;
}