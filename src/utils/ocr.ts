/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorker, Word } from "tesseract.js";
import { ParsedPaciente } from "../types";

let tesseractWorker: any = null;
let isOpenCVLoading = false;
let isOpenCVReady = false;

// Dynamic script loader for OpenCV.js
export function loadOpenCV(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).cv) {
    isOpenCVReady = true;
    return Promise.resolve(true);
  }
  if (isOpenCVLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if ((window as any).cv) {
          clearInterval(check);
          isOpenCVReady = true;
          resolve(true);
        }
      }, 100);
    });
  }

  isOpenCVLoading = true;
  console.log("Lazy-loading OpenCV.js WASM via CDN...");

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.defer = true;
    
    // OpenCV triggers onRuntimeInitialized when WASM compilation is complete
    (window as any).Module = {
      onRuntimeInitialized: () => {
        console.log("OpenCV.js WASM loaded successfully.");
        isOpenCVReady = true;
        isOpenCVLoading = false;
        resolve(true);
      },
    };

    script.onload = () => {
      // In case onRuntimeInitialized doesn't trigger or is missing, fall back to polling
      setTimeout(() => {
        if ((window as any).cv) {
          isOpenCVReady = true;
          isOpenCVLoading = false;
          resolve(true);
        }
      }, 1000);
    };

    script.onerror = (err) => {
      console.warn("Failed to load OpenCV.js from 4.9.0, trying fallback 4.5.5...", err);
      // Fallback script loading
      const fallbackScript = document.createElement("script");
      fallbackScript.src = "https://docs.opencv.org/4.5.5/opencv.js";
      fallbackScript.async = true;
      fallbackScript.defer = true;

      fallbackScript.onload = () => {
        setTimeout(() => {
          if ((window as any).cv) {
            isOpenCVReady = true;
            isOpenCVLoading = false;
            resolve(true);
          }
        }, 1000);
      };

      fallbackScript.onerror = (fallbackErr) => {
        console.error("Failed to load fallback OpenCV.js as well:", fallbackErr);
        isOpenCVLoading = false;
        resolve(false);
      };

      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);
  });
}

export function isOpenCVLoaded(): boolean {
  return isOpenCVReady && !!(window as any).cv;
}

// Lazy load Spanish Tesseract Worker with local caching
export async function getTesseractWorker(onProgress?: (pct: number) => void): Promise<any> {
  if (tesseractWorker) return tesseractWorker;

  console.log("Initializing Spanish Tesseract.js Worker...");
  try {
    const worker = await createWorker("spa", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
      cacheMethod: "write", // Enable local caching
    });

    tesseractWorker = worker;
    return worker;
  } catch (err) {
    console.error("Error initializing Tesseract.js:", err);
    throw err;
  }
}

/**
 * Preprocess image with OpenCV.js (upscale → grayscale)
 * Falls back to HTML5 Canvas 2D if OpenCV is not loaded.
 *
 * Pipeline (when OpenCV available):
 *   1. Optional upscale 4× if image < 1200px (using LANCZOS4 or CUBIC interpolation)
 *   2. Grayscale
 *
 * Pipeline (when OpenCV not available - Canvas 2D fallback):
 *   1. Optional upscale 4× if image < 1200px (using CSS imageSmoothingQuality)
 *   2. Grayscale (via luminance)
 *   3. No additional filtering (we rely on Tesseract's internal preprocessing)
 */
export function preprocessImage(
  imageEl: HTMLImageElement | HTMLVideoElement,
  outputCanvas: HTMLCanvasElement
): boolean {
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) return false;

  // Set canvas size to match image/video source
  let width = imageEl instanceof HTMLVideoElement ? imageEl.videoWidth : imageEl.naturalWidth;
  let height = imageEl instanceof HTMLVideoElement ? imageEl.videoHeight : imageEl.naturalHeight;

  if (width === 0 || height === 0) return false;

  // ---------- OPTIONAL UPSCALE ----------
  const MIN_DIMENSION = 1200;
  let scaleFactor = 1.0;
  const needsUpscale = Math.max(width, height) < MIN_DIMENSION;
  if (needsUpscale) {
    scaleFactor = 4.0; // upscale 4× for tiny scans/photos
    width = Math.round(width * scaleFactor);
    height = Math.round(height * scaleFactor);
  }
  outputCanvas.width = width;
  outputCanvas.height = height;

  // Draw original (upscaled if needed) onto canvas for further processing
  ctx.imageSmoothingEnabled = true;
  // Try to use high-quality resizing if available via CSS; but we'll rely on OpenCV resize later.
  ctx.drawImage(imageEl, 0, 0, width, height);

  // ---------- OPENCV PROCESSING ----------
  if (isOpenCVLoaded()) {
    try {
      const cv = (window as any).cv;
      const src = cv.imread(outputCanvas); // RGBA uchar Mat

      // 1. Upscale if needed (using high-quality interpolation)
      let resized = src;
      if (needsUpscale) {
        // Try to use LANCZOS4 if defined, else fallback to CUBIC
        const interp = typeof cv.INTER_LANCZOS4 !== 'undefined' ? cv.INTER_LANCZOS4 : cv.INTER_CUBIC;
        resized = new cv.Mat();
        cv.resize(src, resized, new cv.Size(width, height), 0, 0, interp);
        src.delete(); // free original
      }

      // 2. Grayscale
      const gray = new cv.Mat();
      cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

      // Show result (grayscale image)
      cv.imshow(outputCanvas, gray);

      // Clean up Mats
      resized.delete(); gray.delete();

      console.log(
        `Image processed with OpenCV.js — upscale=${needsUpscale ? '4×' : '1×'} → ` +
        `Grayscale (${width}x${height})`
      );
      return true;
    } catch (err) {
      console.error("OpenCV processing failed, falling back to Canvas 2D:", err);
    }
  }

  // ---------- FALLBACK: Pure Canvas 2D ----------
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Grayscale conversion (luminance)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);
    console.log(
      `Image processed with Canvas 2D fallback — upscale=${needsUpscale ? '4×' : '1×'} → ` +
      `Grayscale (${width}x${height})`
    );
    return true;
  } catch (err) {
    console.error("Canvas grayscale fallback failed:", err);
    return false;
  }
}

/**
 * Coordinate Clustering and Smart Parsing:
 * Group words into text lines based on bounding boxes, sort them horizontally,
 * and parse rows using Venezuelan clinical-field heuristic rules.
 */
export function parseOCRWords(words: Word[]): ParsedPaciente[] {
  if (!words || words.length === 0) return [];

  // 1. Cluster words into horizontal rows based on vertical midpoint overlap
  const rows: Word[][] = [];
  const sortedWords = [...words].sort((a, b) => {
    const aMidY = (a.bbox.y0 + a.bbox.y1) / 2;
    const bMidY = (b.bbox.y0 + b.bbox.y1) / 2;
    return aMidY - bMidY;
  });

  for (const word of sortedWords) {
    const wordMidY = (word.bbox.y0 + word.bbox.y1) / 2;
    const wordHeight = word.bbox.y1 - word.bbox.y0;
    // Tolerance threshold is 60% of the word height
    const tolerance = Math.max(12, wordHeight * 0.6);

    let placed = false;
    for (const r of rows) {
      // Compare with the average midY of words currently in this row
      const rowMidYSum = r.reduce((sum, w) => sum + (w.bbox.y0 + w.bbox.y1) / 2, 0);
      const rowAvgMidY = rowMidYSum / r.length;

      if (Math.abs(wordMidY - rowAvgMidY) < tolerance) {
        r.push(word);
        placed = true;
        break;
      }
    }

    if (!placed) {
      rows.push([word]);
    }
  }

  const parsedPatients: ParsedPaciente[] = [];

  // Helper cleanups for common OCR noise in medical sheets
  const cleanToken = (text: string) => {
    return text.replace(/[.,:;()_#\-'"\s]/g, "");
  };

  for (const r of rows) {
    // Sort words in the same row horizontally (left-to-right)
    r.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    // Filter out very short noise tokens (e.g. single symbols or very low confidence single-letter tokens)
    const activeWords = r.filter(w => {
      const clean = cleanToken(w.text);
      if (clean.length === 0) return false;
      if (clean.length === 1 && w.confidence < 50) return false;
      return true;
    });

    if (activeWords.length === 0) continue;

    // Calculate average row confidence
    const avgConfidence = Math.round(
      activeWords.reduce((sum, w) => sum + w.confidence, 0) / activeWords.length
    );

    // Heuristic Smart Parser:
    // Identify words based on specific rules:
    // - Number with 6-8 digits as "cédula" (Venezuelan ID ranges)
    // - Numeric value <= 120 as "edad"
    // - Word starting with F/f or M/m as "sexo" (Femenino / Masculino)
    // - Remainder strings form the "nombre" and "procedencia" (origin)

    let parsedCedula = "";
    let parsedEdad: number | undefined = undefined;
    let parsedSexo: "Masculino" | "Femenino" | "Desconocido" = "Desconocido";
    const nameTokens: string[] = [];
    const originTokens: string[] = [];

    // Tracks if we have already assigned these values in the row
    let hasCedula = false;
    let hasEdad = false;
    let hasSexo = false;

    for (const word of activeWords) {
      const clean = cleanToken(word.text);
      const lowerText = word.text.toLowerCase().trim();

      // Check if it's a Cédula (typically 6 to 8 digits, sometimes prepended by V/E or with extra characters)
      const digitsOnly = clean.replace(/\D/g, "");
      if (!hasCedula && digitsOnly.length >= 6 && digitsOnly.length <= 9) {
        parsedCedula = digitsOnly;
        hasCedula = true;
        continue;
      }

      // Check if it's a Sex token
      const isM = /^(m(asc)?(ulino)?|h(ombre)?)$/i.test(clean);
      const isF = /^(f(em)?(enino)?|m(ujer)?)$/i.test(clean);
      if (!hasSexo && (isM || isF)) {
        parsedSexo = isM ? "Masculino" : "Femenino";
        hasSexo = true;
        continue;
      }

      // Check if it's an Age (numeric <= 120, not part of a Cédula)
      const numVal = parseInt(clean, 10);
      if (!hasEdad && !isNaN(numVal) && numVal > 0 && numVal <= 120 && clean.length <= 3) {
        parsedEdad = numVal;
        hasEdad = true;
        continue;
      }

      // If it's none of the above, we map it as text tokens
      // Words before numbers are usually part of the patient's name
      // Words after numbers or other metadata are often parsed as origin/procedencia
      if (!hasCedula && !hasEdad) {
        nameTokens.push(word.text);
      } else {
        originTokens.push(word.text);
      }
    }

    const fullname = nameTokens.join(" ").trim();
    
    // Skip row if name is empty or too short (could be just header noise like "Nombre", "Cedula", etc.)
    if (!fullname || fullname.length < 3 || /^(nombre|cedula|edad|sexo|hospital|fecha|ingreso)$/i.test(fullname)) {
      continue;
    }

    // Compose parsed object
    parsedPatients.push({
      id_temporal: Math.random().toString(36).substring(2, 9),
      nombre: fullname,
      cedula: parsedCedula || undefined,
      edad: parsedEdad,
      sexo: parsedSexo,
      procedencia: originTokens.join(" ").trim() || undefined,
      confianza_ocr: avgConfidence,
      status_verificacion: "pendiente",
    });
  }

  return parsedPatients;
}
