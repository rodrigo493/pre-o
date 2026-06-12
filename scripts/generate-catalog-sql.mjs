import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).href;

const KNOWN_UNITS = new Set(["UNIDADE","PECA","QUILOGRAMA","KG","TONELADA","METRO","MT","M","LITRO","L","BARRA","CENTO","MILHEIRO","PAR","UN","PC","CX","CAIXA","ROLO","GRAMA"]);
const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normUnit = (s) => stripAccents(s.trim().toUpperCase()).replace(/\s+/g, "");
const isUnit = (s) => KNOWN_UNITS.has(normUnit(s));

function groupRows(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.y / 3) * 3;
    if (!map.has(y)) map.set(y, []);
    map.get(y).push({ str: it.str.trim(), x: it.x });
  }
  return [...map.entries()].sort((a,b)=>a[0]-b[0]).map(([,c])=>c.sort((a,b)=>a.x-b.x));
}
function findAnchors(rows) {
  for (const cells of rows) {
    const joined = cells.map(c=>c.str).join(" ");
    if (!joined.includes("Código") || !/Descri/.test(joined)) continue;
    const codigo = cells.find(c=>c.str.includes("Código"));
    const descricao = cells.find(c=>/Descri/.test(c.str));
    const ums = cells.filter(c=>/^U\.?M\.?/i.test(c.str.trim())).sort((a,b)=>a.x-b.x);
    const tipo = cells.find(c=>/^Tipo/.test(c.str.trim()));
    if (!codigo||!descricao||!ums.length||!tipo) continue;
    return { codigoX:codigo.x, descricaoX:descricao.x, umX:ums[0].x, tipoX:tipo.x };
  }
  return null;
}
const isHeader = (cells)=>cells.some(c=>c.str.includes("Código"))&&cells.some(c=>/Descri/.test(c.str));

function parse(pages) {
  const out=[]; let anchors=null, pending=null;
  const flush=()=>{ if(pending){ pending.nome=pending.nome.replace(/\s+/g," ").trim(); if(pending.codigo&&pending.nome) out.push(pending); pending=null; } };
  for (const items of pages) {
    const rows=groupRows(items);
    if(!anchors) anchors=findAnchors(rows);
    if(!anchors) continue;
    const codigoEnd=(anchors.codigoX+anchors.descricaoX)/2;
    const descricaoEnd=(anchors.descricaoX+anchors.umX)/2;
    for (const cells of rows) {
      if(isHeader(cells)) continue;
      const codigo=cells.filter(c=>c.x<codigoEnd).map(c=>c.str).join(" ").trim();
      const descricao=cells.filter(c=>c.x>=codigoEnd&&c.x<descricaoEnd).map(c=>c.str).join(" ").trim();
      if(codigo){
        flush();
        const u=cells.filter(c=>c.x>=descricaoEnd&&c.x<anchors.tipoX&&isUnit(c.str)).sort((a,b)=>a.x-b.x);
        const ressup=cells.map(c=>c.str).join(" ");
        pending={ codigo, nome:descricao, unidade:u[0]?normUnit(u[0].str):null, unidadeSecundaria:u[1]?normUnit(u[1].str):null, tipo:/fabricado/i.test(ressup)?"montado":"comprado" };
      } else if(pending&&descricao){ pending.nome=`${pending.nome} ${descricao}`; }
    }
  }
  flush();
  return out;
}

async function extract(file) {
  const data=new Uint8Array(readFileSync(file));
  const pdf=await pdfjs.getDocument({data}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const vp=page.getViewport({scale:1});
    const items=[];
    for(const it of content.items) if("str" in it && it.str.trim()){ const tx=it.transform; items.push({str:it.str,x:tx[4],y:vp.height-tx[5]}); }
    pages.push(items);
  }
  return pages;
}

const dir="produtos";
const files=readdirSync(dir).filter(f=>f.toLowerCase().endsWith(".pdf"));
const all=[];
for(const f of files){ const pages=await extract(join(dir,f)); all.push(...parse(pages)); }
// dedupe por codigo (mantem ultimo)
const byCod=new Map();
for(const p of all) byCod.set(p.codigo,p);
const prods=[...byCod.values()];

const esc=(s)=> s===null? "null" : `'${String(s).replace(/'/g,"''")}'`;
let sql="-- Catálogo Nomus gerado de "+files.length+" PDFs ("+prods.length+" produtos)\n";
const LOTE=1000;
for(let i=0;i<prods.length;i+=LOTE){
  const slice=prods.slice(i,i+LOTE);
  sql+="insert into public.produtos_mestre (codigo, nome, unidade, unidade_secundaria, tipo) values\n";
  sql+=slice.map(p=>`  (${esc(p.codigo)}, ${esc(p.nome)}, ${esc(p.unidade)}, ${esc(p.unidadeSecundaria)}, ${esc(p.tipo)})`).join(",\n");
  sql+="\non conflict (codigo) do update set\n  nome = excluded.nome,\n  unidade = excluded.unidade,\n  unidade_secundaria = excluded.unidade_secundaria,\n  tipo = excluded.tipo;\n\n";
}
writeFileSync("scripts/catalogo_nomus.sql", sql);
console.log(`PDFs: ${files.length} | produtos unicos: ${prods.length}`);
console.log("amostra:", prods.slice(0,3));
