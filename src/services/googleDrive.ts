import { clearDriveAccessToken } from '../firebase';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const VAULT_FOLDER_NAME = 'sainbyte-vault';

let cachedVaultFolderId: string | null = null;

export class DriveApiError extends Error {
  status: number;
  isAuthError: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
  }
}

export interface UploadedDriveFile {
  driveFileId: string;
  driveViewUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

async function parseDriveError(res: Response, fallback: string): Promise<DriveApiError> {
  let msg = fallback;
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    if (json?.error?.message) {
      msg = json.error.message;
    }
  } catch {
    // ignore JSON parse errors
  }
  if (res.status === 401) {
    clearDriveAccessToken();
    return new DriveApiError(
      'Sesi izin Google Drive kedaluwarsa. Klik "Hubungkan Google Drive" untuk menyambung ulang.',
      401
    );
  }
  if (res.status === 403) {
    return new DriveApiError(
      `Akses Google Drive ditolak (${msg}). Pastikan izin Google Drive disetujui dan Drive API aktif.`,
      403
    );
  }
  return new DriveApiError(msg, res.status);
}

export async function ensureVaultFolder(accessToken: string): Promise<string> {
  if (cachedVaultFolderId) {
    try {
      const verifyRes = await fetch(
        `${DRIVE_API_BASE}/files/${encodeURIComponent(cachedVaultFolderId)}?fields=id,trashed`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (verifyRes.ok) {
        const verified = (await verifyRes.json()) as { id?: string; trashed?: boolean };
        if (verified.id && !verified.trashed) {
          return verified.id;
        }
      }
    } catch {
      // re-query below
    }
    cachedVaultFolderId = null;
  }

  const q = encodeURIComponent(
    `name = '${VAULT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `${DRIVE_API_BASE}/files?q=${q}&spaces=drive&fields=files(id,name)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw await parseDriveError(searchRes, 'Gagal memeriksa folder Vault di Google Drive.');
  }

  const searchJson = (await searchRes.json()) as { files?: { id: string; name: string }[] };
  if (searchJson.files && searchJson.files.length > 0) {
    cachedVaultFolderId = searchJson.files[0].id;
    return cachedVaultFolderId;
  }

  const createRes = await fetch(`${DRIVE_API_BASE}/files?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: VAULT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw await parseDriveError(createRes, 'Gagal membuat folder privat sainbyte-vault di Google Drive.');
  }
  const created = (await createRes.json()) as { id: string };
  cachedVaultFolderId = created.id;
  return created.id;
}

export async function uploadFileToDrive(
  file: File,
  accessToken: string,
  onProgress?: (percent: number) => void
): Promise<UploadedDriveFile> {
  const folderId = await ensureVaultFolder(accessToken);
  const mimeType = file.type || 'application/octet-stream';

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        mimeType,
        parents: [folderId],
      }),
    }
  );

  if (!initRes.ok) {
    throw await parseDriveError(initRes, 'Gagal memulai unggahan ke Google Drive.');
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new DriveApiError('URL sesi unggahan Google Drive tidak ditemukan.', 500);
  }

  // Step 2: Upload bytes with progress tracking
  return new Promise<UploadedDriveFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            id: string;
            name?: string;
            mimeType?: string;
            size?: string;
            webViewLink?: string;
          };
          onProgress?.(100);
          resolve({
            driveFileId: data.id,
            driveViewUrl:
              data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
            fileName: data.name || file.name,
            fileSize: data.size ? Number(data.size) : file.size,
            mimeType: data.mimeType || mimeType,
          });
        } catch {
          reject(new DriveApiError('Respons unggahan Google Drive tidak valid.', xhr.status));
        }
      } else if (xhr.status === 401) {
        clearDriveAccessToken();
        reject(
          new DriveApiError(
            'Sesi izin Google Drive berakhir saat mengunggah. Hubungkan ulang Google Drive.',
            401
          )
        );
      } else {
        reject(new DriveApiError(`Gagal mengunggah ke Google Drive (HTTP ${xhr.status}).`, xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new DriveApiError('Koneksi jaringan terputus saat mengunggah ke Google Drive.', 0));
    };

    xhr.send(file);
  });
}

export async function fetchDriveBlobUrl(
  driveFileId: string,
  accessToken: string
): Promise<{ blobUrl: string; mimeType: string }> {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw await parseDriveError(res, 'Gagal memuat file dari Google Drive.');
  }
  const blob = await res.blob();
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType: blob.type || 'application/octet-stream',
  };
}

export async function downloadDriveFile(
  driveFileId: string,
  fileName: string,
  accessToken: string
): Promise<void> {
  const { blobUrl } = await fetchDriveBlobUrl(driveFileId, accessToken);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'vault-file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
  }
}

export async function deleteDriveFile(
  driveFileId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (res.status === 404 || res.status === 204 || res.ok) {
    return;
  }
  throw await parseDriveError(res, 'Gagal menghapus file di Google Drive.');
}

export interface DriveFolderFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function listVaultFolderFiles(
  accessToken: string
): Promise<DriveFolderFile[]> {
  const folderId = await ensureVaultFolder(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    'files(id,name,mimeType,size,modifiedTime,webViewLink)'
  );
  const res = await fetch(
    `${DRIVE_API_BASE}/files?q=${q}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=100&fields=${fields}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw await parseDriveError(
      res,
      'Gagal memuat daftar file dari folder Google Drive.'
    );
  }
  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name?: string;
      mimeType?: string;
      size?: string;
      modifiedTime?: string;
      webViewLink?: string;
    }>;
  };
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name || 'Tanpa Nama',
    mimeType: f.mimeType || 'application/octet-stream',
    size: f.size ? Number(f.size) : 0,
    modifiedTime: f.modifiedTime,
    webViewLink:
      f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
  }));
}

export function formatDriveMimeLabel(mimeType: string, fileName = ''): string {
  const mime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (mime === 'application/vnd.google-apps.folder') return 'Folder';
  if (mime.startsWith('image/')) {
    const sub = mime.split('/')[1]?.toUpperCase() || 'IMG';
    return `Gambar ${sub === 'JPEG' ? 'JPG' : sub}`;
  }
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'PDF';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls')
  ) {
    return 'Excel / Sheet';
  }
  if (mime === 'text/csv' || lowerName.endsWith('.csv')) return 'CSV';
  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return 'Dokumen Word';
  }
  if (mime.includes('json') || lowerName.endsWith('.json')) return 'JSON';
  if (mime.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return 'Teks / Markdown';
  }
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  const extMatch = lowerName.match(/\.([a-z0-9]{1,8})$/);
  if (extMatch) return extMatch[1].toUpperCase();
  return mime.split('/')[1]?.toUpperCase() || 'Berkas';
}

