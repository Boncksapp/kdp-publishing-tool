import { PDFDocument } from "pdf-lib";
import type {
  AnalysisResult,
  PageInfo,
  Violation,
  GutterConfig,
  BookType,
} from "./types";

const POINTS_PER_INCH = 72;
const TRIM_WIDTH = 8.25 * POINTS_PER_INCH;
const TRIM_HEIGHT = 11 * POINTS_PER_INCH;

export function getGutterConfig(pageCount: number): GutterConfig {
  let requiredGutter: number;
  if (pageCount <= 150) requiredGutter = 0.375;
  else if (pageCount <= 300) requiredGutter = 0.5;
  else if (pageCount <= 500) requiredGutter = 0.625;
  else if (pageCount <= 700) requiredGutter = 0.75;
  else requiredGutter = 0.875;

  const insideMargin = requiredGutter + 0.125;
  const outsideMargin = 0.625;
  const topMargin = 0.625;
  const bottomMargin = 0.625;

  return { pageCount, requiredGutter, insideMargin, outsideMargin, topMargin, bottomMargin };
}

export async function analyzePDF(
  file: File,
  onProgress?: (message: string) => void
): Promise<AnalysisResult> {
  onProgress?.("Reading PDF file...");

  const arrayBuffer = await file.arrayBuffer();

  // Check if PDF can be loaded
  let pdfLibDoc: PDFDocument;
  try {
    pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  } catch (e) {
    const errMsg = (e as Error).message.toLowerCase();
    if (errMsg.includes("password") || errMsg.includes("encrypt")) {
      return {
        pages: [], pageCount: 0, bookType: "paperback",
        trimWidth: TRIM_WIDTH, trimHeight: TRIM_HEIGHT,
        bleedDetected: false,
        violations: [{ type: "font_not_embedded", page: 0, severity: "error", description: "Password-protected PDF. Cannot process.", fixed: false }],
        gutter: getGutterConfig(0),
        isImageOnlyPdf: false, isPasswordProtected: true, isCorrupted: false, isScannedOnly: false, supportedFile: false,
      };
    }
    return {
      pages: [], pageCount: 0, bookType: "paperback",
      trimWidth: TRIM_WIDTH, trimHeight: TRIM_HEIGHT,
      bleedDetected: false,
      violations: [{ type: "font_not_embedded", page: 0, severity: "error", description: `Corrupted PDF: ${(e as Error).message}`, fixed: false }],
      gutter: getGutterConfig(0),
      isImageOnlyPdf: false, isPasswordProtected: false, isCorrupted: true, isScannedOnly: false, supportedFile: false,
    };
  }

  const pageCount = pdfLibDoc.getPageCount();
  onProgress?.(`PDF has ${pageCount} pages. Analyzing...`);

  const pages: PageInfo[] = [];
  const violations: Violation[] = [];
  let trimIssues = 0;

  for (let i = 0; i < pageCount; i++) {
    const page = pdfLibDoc.getPages()[i];
    const pw = page.getWidth();
    const ph = page.getHeight();

    pages.push({
      index: i + 1,
      width: pw,
      height: ph,
      rotation: 0,
      textBlocks: [],
      images: [],
      isImageOnly: false,
    });

    if (Math.abs(pw - TRIM_WIDTH) > 1 || Math.abs(ph - TRIM_HEIGHT) > 1) {
      trimIssues++;
      violations.push({
        type: "trim_size",
        page: i + 1,
        severity: "error",
        description: `Page ${i + 1}: ${(pw/POINTS_PER_INCH).toFixed(2)}" x ${(ph/POINTS_PER_INCH).toFixed(2)}". Expected 8.25" x 11".`,
        fixed: false,
      });
    }
  }

  const bookType: BookType = pageCount > 100 ? "hardcover" : "paperback";
  const gutter = getGutterConfig(pageCount);

  return {
    pages,
    pageCount,
    bookType,
    trimWidth: TRIM_WIDTH,
    trimHeight: TRIM_HEIGHT,
    bleedDetected: false,
    violations,
    gutter,
    isImageOnlyPdf: false,
    isPasswordProtected: false,
    isCorrupted: false,
    isScannedOnly: false,
    supportedFile: true,
  };
}
