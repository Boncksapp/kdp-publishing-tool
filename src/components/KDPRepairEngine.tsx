import { useState, useRef } from "react";
import { PDFDocument } from "pdf-lib";

export default function KDPRepairEngine() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [dlUrl, setDlUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const src = await PDFDocument.load(await file.arrayBuffer());
      const dst = await PDFDocument.create();
      for (let i = 0; i < src.getPageCount(); i++) {
        const [p] = await dst.copyPages(src, [i]);
        dst.addPage(p);
        p.setSize(594, 792);
        p.setCropBox(0, 0, 594, 792);
      }
      const raw = await dst.save();
      // raw is Uint8Array - copy it to a standard ArrayBuffer for the Blob
      const copy = new ArrayBuffer(raw.length);
      const view = new Uint8Array(copy);
      view.set(raw);
      const blob = new Blob([copy], { type: "application/pdf" });
      setDlUrl(URL.createObjectURL(blob));
      setDone(true);

      // Try auto-download
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "kdp-corrected-" + file.name;
        a.click();
      }, 100);
    } catch (e: any) {
      setErr("Error: " + (e.message || "Unknown"));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-center text-gray-900">
        Amazon KDP Manuscript Repair Engine
      </h1>
      <p className="mb-8 text-center text-gray-600">
        Upload a PDF to fix trim size to 8.25" x 11"
      </p>

      <div className="mb-6 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setDone(false); setDlUrl(""); setErr(""); }
          }}
        />
        {!file ? (
          <div className="cursor-pointer" onClick={() => inputRef.current?.click()}>
            <p className="text-lg font-medium text-gray-700">Click to select a PDF file</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-green-700">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
            <button onClick={() => { setFile(null); setDone(false); setDlUrl(""); setErr(""); }}
              className="mt-2 text-sm text-blue-600 hover:underline">Remove</button>
          </div>
        )}
      </div>

      {file && !done && (
        <div className="text-center">
          <button onClick={run} disabled={busy}
            className="rounded-xl bg-blue-600 px-8 py-3 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {busy ? "Repairing..." : "Repair PDF"}
          </button>
        </div>
      )}

      {busy && <div className="mt-4 text-center text-blue-600">Processing PDF...</div>}
      {err && <div className="mt-4 rounded-lg bg-red-50 p-4 text-red-700 text-center">{err}</div>}

      {done && dlUrl && (
        <div className="mt-6 text-center space-y-4">
          <div className="rounded-lg bg-green-50 p-4 text-green-800 font-medium">
            ✓ Repaired! File ready for download.
          </div>
          <a
            href={dlUrl}
            download={"kdp-corrected-" + file?.name}
            className="inline-block rounded-xl bg-green-600 px-8 py-3 text-lg font-semibold text-white shadow-lg hover:bg-green-700"
          >
            Download Corrected PDF
          </a>
          <div className="text-sm text-gray-500">
            If the download doesn't start, right-click and "Save link as..."
          </div>
        </div>
      )}
    </div>
  );
}
