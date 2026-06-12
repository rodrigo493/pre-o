import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "fs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).href;

const file = process.argv[2];
const data = new Uint8Array(readFileSync(file));
const pdf = await pdfjs.getDocument({ data }).promise;
const page = await pdf.getPage(1);
const content = await page.getTextContent();
const viewport = page.getViewport({ scale: 1 });

const items = [];
for (const it of content.items) {
  if ("str" in it && it.str.trim()) {
    const tx = it.transform;
    items.push({ str: it.str, x: Math.round(tx[4]), y: Math.round(viewport.height - tx[5]) });
  }
}
items.sort((a, b) => a.y - b.y || a.x - b.x);
for (const it of items.slice(0, 60)) {
  console.log(`y=${String(it.y).padStart(4)} x=${String(it.x).padStart(4)}  ${JSON.stringify(it.str)}`);
}
