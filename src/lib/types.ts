// Types for the KDP Manuscript Repair Engine

export type BookType = "hardcover" | "paperback";
export type BleedMode = "bleed" | "nobled" | "autodetect";

export interface PageInfo {
  index: number;
  width: number; // in points (1 inch = 72 points)
  height: number;
  rotation: number;
  textBlocks: TextBlock[];
  images: ImageBlock[];
  isImageOnly: boolean;
}

export interface TextBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  transform: number[];
}

export interface ImageBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  dpi: number;
}

export interface Violation {
  type: ViolationType;
  page: number;
  severity: "error" | "warning";
  description: string;
  details?: Record<string, unknown>;
  fixed: boolean;
}

export type ViolationType =
  | "trim_size"
  | "gutter_insufficient"
  | "gutter_intrusion"
  | "outside_margin"
  | "top_margin"
  | "bottom_margin"
  | "header_position"
  | "footer_position"
  | "page_number_position"
  | "image_safe_zone"
  | "bleed_insufficient"
  | "bleed_intrusion"
  | "font_not_embedded"
  | "font_substitution"
  | "mirrored_margin"
  | "page_count"
  | "image_dpi"
  | "image_clipped";

export interface GutterConfig {
  pageCount: number;
  requiredGutter: number; // in inches
  insideMargin: number; // with safety buffer
  outsideMargin: number;
  topMargin: number;
  bottomMargin: number;
}

export interface AnalysisResult {
  pages: PageInfo[];
  pageCount: number;
  bookType: BookType;
  trimWidth: number; // points
  trimHeight: number; // points
  bleedDetected: boolean;
  violations: Violation[];
  gutter: GutterConfig;
  isImageOnlyPdf: boolean;
  isPasswordProtected: boolean;
  isCorrupted: boolean;
  isScannedOnly: boolean;
  supportedFile: boolean;
}

export interface RepairResult {
  success: boolean;
  repairedPdf?: Uint8Array;
  violationsFixed: number;
  violationsRemaining: number;
  validationStatus: "PASS" | "FAIL";
  report: RepairReport;
  errorMessage?: string;
}

export interface RepairReport {
  book_type: string;
  trim_size: string;
  bleed: boolean;
  page_count: number;
  required_gutter: string;
  inside_margin: string;
  outside_margin: string;
  top_margin: string;
  bottom_margin: string;
  violations_found: number;
  violations_fixed: number;
  validation: "PASS" | "FAIL";
  details: ViolationDetail[];
}

export interface ViolationDetail {
  page: number;
  type: ViolationType;
  description: string;
  fixed: boolean;
}