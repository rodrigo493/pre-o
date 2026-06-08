import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync } from "fs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).href;

const file = process.argv[2];
const out = process.argv[3];
const data = new Uint8Array(readFileSync(file));
const pdf = await pdfjs.getDocument({ data }).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const items = [];
  for (const it of content.items) {
    if ("str" in it && it.str.trim()) {
      const tx = it.transform;
      items.push({ str: it.str, x: tx[4], y: viewport.height - tx[5], width: it.width || 0 });
    }
  }
  pages.push(items);
}
writeFileSync(out, JSON.stringify(pages));
console.log(`wrote ${pages.length} pages to ${out}`);
