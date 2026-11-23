import type { Material } from './state';
const limit = 100000;
function bounded(value: string, name: string) {
  if (value.length > limit) throw new Error(name + ' 超过 100,000 字符，请按章节拆分后导入。');
  return value;
}
export async function extractFile(file: File): Promise<string> {
  if (/\.(md|txt|csv)$/i.test(file.name) || file.type === 'text/plain') {
    if (file.size > 400000) throw new Error(file.name + ' 超过本地文本容量，请按章节拆分后导入。');
    return bounded(await file.text(), file.name);
  }
  if (/\.docx$/i.test(file.name)) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const xml = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
      if (entry.name !== 'word/document.xml') return false;
      if (entry.originalSize > 16 * 1024 * 1024) throw new Error('Word 正文过大，请按章节拆分。');
      return true;
    } })['word/document.xml'];
    if (!xml) throw new Error(file.name + ' 缺少 Word 正文。');
    const doc = new DOMParser().parseFromString(strFromU8(xml), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(file.name + ' 正文格式无效。');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    return bounded(Array.from(doc.getElementsByTagNameNS(ns, 'p'), p => Array.from(p.getElementsByTagNameNS(ns, 't'), t => t.textContent).join('')).join('\n'), file.name);
  }
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await import('pdfjs-dist');
    pdf.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const task = pdf.getDocument({ data: await file.arrayBuffer(), useSystemFonts: true });
    try {
      const doc = await task.promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const body = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        if (body) text = bounded(text + (text ? '\n\n' : '') + '## 第 ' + i + ' 页\n' + body, file.name);
        page.cleanup();
      }
      return text;
    } finally { await task.destroy(); }
  }
  return '';
}
export async function sourceHash(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = crypto.subtle ? await crypto.subtle.digest('SHA-256', bytes) : (await import('@noble/hashes/sha2.js')).sha256(bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
async function originalFile(hash: string, file?: Blob): Promise<Blob | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('edu-material-originals', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction('files', file ? 'readwrite' : 'readonly');
      const store = tx.objectStore('files');
      const req = file ? store.put(file, hash) : store.get(hash);
      tx.oncomplete = () => resolve(file || req.result as Blob | undefined);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('原文件保存失败。'));
    });
  } finally { db.close(); }
}
export const saveOriginal = (hash: string, file: Blob) => originalFile(hash, file);
export const getOriginal = (hash: string) => originalFile(hash);
export function originalFields(row: Partial<Material>) {
  return typeof row.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(row.sourceHash) && typeof row.sourceName === 'string'
    ? { sourceHash: row.sourceHash, sourceName: row.sourceName.slice(0, 200), ...(typeof row.extractionNote === 'string' ? { extractionNote: row.extractionNote.slice(0, 300) } : {}) } : {};
}
