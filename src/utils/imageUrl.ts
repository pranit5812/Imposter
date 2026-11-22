import { CONFIG } from '../config';

/**
 * Resolves a photo URL (Base64 data URI, relative /uploads/xxx.jpg, or full URL)
 * to an accessible URI that React Native Image components can render reliably.
 */
export const resolvePhotoUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // 1. Embedded Base64 Data URI or Blob: directly displayable without network latency
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // 2. Raw base64 string without data prefix (JPEG / PNG magic bytes or long base64 string)
  if (
    trimmed.startsWith('/9j/') ||
    trimmed.startsWith('iVBORw0KGgo') ||
    trimmed.startsWith('R0lGOD') ||
    trimmed.startsWith('JVBERi0') ||
    (trimmed.length > 300 && !trimmed.includes(' ') && !trimmed.includes('/'))
  ) {
    return `data:image/jpeg;base64,${trimmed}`;
  }

  const cleanBase = CONFIG.API_BASE_URL.replace(/\/+$/, '');

  // 2. Dead Firebase Storage link without download token (403): Fallback to backend /uploads/
  if (trimmed.includes('firebasestorage.googleapis.com') && !trimmed.includes('token=')) {
    const match = trimmed.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]);
      const filename = decoded.split('/').pop();
      if (filename) {
        return `${cleanBase}/uploads/${filename}`;
      }
    }
  }

  // 3. Absolute http / https / file URLs
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file:')
  ) {
    return trimmed;
  }

  // 4. Relative paths like /uploads/xyz.jpg or uploads/xyz.jpg
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${cleanBase}${cleanPath}`;
};

/**
 * Checks if a check-in selfie from an attendance record has expired (past 12:00 PM midnight / end of day)
 */
export const isPhotoExpired = (checkInDate?: string | Date | null): boolean => {
  if (!checkInDate) return false;
  try {
    const recordDate = new Date(checkInDate);
    if (isNaN(recordDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    recordDate.setHours(0, 0, 0, 0);
    return recordDate.getTime() < today.getTime();
  } catch {
    return false;
  }
};
