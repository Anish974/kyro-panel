import { PROFILE_LIMITS } from '@kyro/shared';

// Pulls plain text out of an uploaded resume so the panel can ask about the
// candidate's real projects instead of a generic warm-up. Text never leaves the
// browser except as the /candidate POST — the file itself is never uploaded.

/** What the file picker offers. Anything else is refused with a readable error. */
export const RESUME_ACCEPT = '.pdf,.txt,.md';

/** A resume is a few pages. Anything past this is a mistake, not a resume. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Nobody reads page 12 of a resume, and neither does the panel. */
const MAX_PAGES = 8;

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error('That file is over 5 MB — attach the resume itself, not a portfolio.');
  }

  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return tidy(await file.text());
  }
  if (name.endsWith('.pdf')) {
    return readPdf(file);
  }
  throw new Error('Upload a PDF, TXT or MD file.');
}

async function extractRawPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = text.match(/\((.*?)\)\s*Tj/g) || text.match(/\[(.*?)\]\s*TJ/g) || [];
  const extracted = matches
    .map(m => m.replace(/^[\(\[]/, '').replace(/[\)\]]\s*T[jJ]$/, ''))
    .join(' ');
  return extracted;
}

async function readPdf(file: File): Promise<string> {
  // pdf.js is imported dynamically so the login screen stays fast
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
    }

    const text = tidy(pages.join('\n\n'));
    if (text.length >= 40) return text;
  } catch (err) {
    console.warn('pdf.js parser encountered an issue, trying raw extractor:', err);
    try {
      const raw = tidy(await extractRawPdfText(file));
      if (raw.length >= 40) return raw;
    } catch {
      // ignore
    }

    const errMsg = (err as Error).message || '';
    if (errMsg.includes('Failed to fetch dynamically imported module') || errMsg.includes('404')) {
      throw new Error('A new version was just deployed! Please hard-refresh your browser tab (Cmd+Shift+R / Ctrl+F5).');
    }
    throw err;
  }

  // A scanned or image-only resume parses to nothing. Saying so beats silently
  // handing the panel an empty document and letting it ask generic questions.
  throw new Error('No selectable text in that PDF — it looks scanned. Try a TXT export.');
}

/** pdf.js emits ragged whitespace; the panel prompt pays for every character. */
const tidy = (raw: string): string =>
  raw
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PROFILE_LIMITS.resumeText);
