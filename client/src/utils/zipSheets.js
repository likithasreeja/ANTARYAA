import { unzip } from 'fflate';

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_SHEETS_PER_ZIP = 50;
const MAX_UNZIPPED_BYTES = 150 * 1024 * 1024;

const SHEET_PATTERN = /\.(xlsx|xls|xlsm|csv)$/i;

export const isZipFile = (file) => /\.zip$/i.test(file.name);

// Folders, macOS metadata, hidden files and Excel lock files are not real content
const isJunk = (path) => path.endsWith('/') || path.startsWith('__MACOSX/') || /(^|\/)(\.|~\$)/.test(path);

/**
 * Reads a .zip and returns the sales sheets inside it (any folder depth).
 * `skipped` lists the entries that were left out, with the reason.
 */
export async function extractSheetsFromZip(zipFile, maxSheetBytes) {
  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  const skipped = [];
  let count = 0;
  let totalBytes = 0;

  const entries = await new Promise((resolve, reject) => {
    unzip(bytes, {
      // Runs before decompression, so rejected entries never use memory
      filter: ({ name, originalSize }) => {
        if (isJunk(name)) return false;
        let reason = '';
        if (!SHEET_PATTERN.test(name)) reason = 'not an Excel or CSV file';
        else if (originalSize > maxSheetBytes) reason = 'too large';
        else if (count >= MAX_SHEETS_PER_ZIP) reason = `more than ${MAX_SHEETS_PER_ZIP} sheets`;
        else if (totalBytes + originalSize > MAX_UNZIPPED_BYTES) reason = 'ZIP contents too large';
        if (reason) {
          skipped.push({ name, reason });
          return false;
        }
        count += 1;
        totalBytes += originalSize;
        return true;
      }
    }, (err, result) => (err ? reject(new Error('Could not open this ZIP. It may be damaged or password protected.')) : resolve(result)));
  });

  // The folder path stays in the name so same-named sheets can be told apart
  const files = Object.entries(entries).map(([path, data]) => new File([data], path.replace(/\//g, ' - ')));
  return { files, skipped };
}
