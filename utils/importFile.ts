import { strFromU8, unzipSync } from 'fflate';

/**
 * Lo que la persona sube para importar → lo que entiende la IA: una imagen o PDF en base64, o texto.
 * Excel y el ZIP de Notion se abren aquí, en su navegador; a la nube solo va el texto.
 */
export type Prepared = { text?: string; file?: { mime: string; name: string; data: string } };

const MAX_BASE64 = 4_000_000;
const TEXT_FILE = /\.(csv|tsv|md|markdown|txt|json|html?)$/i;
const toBase64 = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(out);
};

/** Un número de Excel entre 0 y 1 es una hora del día (0,375 = 09:00). */
const cellText = (raw: string) => {
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n) || n <= 0 || n >= 1) return raw;
  const min = Math.round(n * 1440);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};

export function xlsxToText(data: Uint8Array) {
  const files = unzipSync(data);
  const xml = (name: string) => new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml');
  const shared = files['xl/sharedStrings.xml'] ? Array.from(xml('xl/sharedStrings.xml').getElementsByTagName('si')).map((s) => s.textContent ?? '') : [];
  return Object.keys(files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort()
    .map((f) =>
      Array.from(xml(f).getElementsByTagName('row'))
        .map((row) =>
          Array.from(row.getElementsByTagName('c'))
            .map((c) => {
              const v = c.getElementsByTagName('v')[0]?.textContent ?? c.getElementsByTagName('t')[0]?.textContent ?? '';
              return c.getAttribute('t') === 's' ? (shared[Number(v)] ?? '') : c.getAttribute('t') ? v : cellText(v);
            })
            .join('\t')
        )
        .filter((l) => l.trim())
        .join('\n')
    )
    .join('\n\n');
}

export function zipToText(data: Uint8Array): string {
  const files = unzipSync(data);
  return Object.entries(files)
    .flatMap(([name, bytes]) => {
      if (/\.zip$/i.test(name)) return [zipToText(bytes)];
      if (TEXT_FILE.test(name) && !name.startsWith('__MACOSX')) return [`# ${name.split('/').pop()}\n${strFromU8(bytes)}`];
      return [];
    })
    .join('\n\n');
}

const shrinkImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No pude abrir esa imagen. Prueba con JPG o PNG.'));
    };
    img.src = url;
  });

export async function prepareFile(file: File): Promise<Prepared> {
  const name = file.name;
  if (file.type.startsWith('image/')) return { file: { mime: 'image/jpeg', name, data: await shrinkImage(file) } };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
    const data = toBase64(bytes);
    if (data.length > MAX_BASE64) throw new Error('Ese PDF es muy pesado (máximo 3 MB). Prueba con una foto del horario.');
    return { file: { mime: 'application/pdf', name, data } };
  }
  if (/\.xlsx$/i.test(name)) return { text: xlsxToText(bytes) };
  if (/\.xls$/i.test(name)) throw new Error('Ese Excel es muy antiguo: guárdalo como .xlsx o CSV.');
  if (/\.zip$/i.test(name)) {
    const text = zipToText(bytes);
    if (!text.trim()) throw new Error('Ese ZIP no trae archivos que pueda leer. En Notion exporta como Markdown y CSV.');
    return { text };
  }
  if (TEXT_FILE.test(name) || file.type.startsWith('text/')) return { text: strFromU8(bytes) };
  throw new Error('No puedo leer ese tipo de archivo. Sirven foto, PDF, Excel, CSV, Markdown, texto o el ZIP de Notion.');
}
