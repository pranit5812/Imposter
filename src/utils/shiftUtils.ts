/**
 * Shift Timing Rules (IST - Indian Standard Time):
 * - Shift Check-In Window: Open
 * - Manual Check-in and Check-out only.
 * Applies to both Employee and Supervisor portals.
 */

export interface ShiftInfo {
  isCheckInAllowed: boolean;
  isPastShiftEnd: boolean;
  isBeforeShiftStart: boolean;
  isAfterShiftEnd: boolean;
  punctualityLabel: 'On-Time' | 'Late Checked-In' | 'Half-Day' | 'Check-In Closed';
  statusKey: 'present' | 'late' | 'half-day' | 'closed';
  istHours: number;
  istMinutes: number;
  formattedTimeIST: string;
  windowMessage: string;
}

export const getShiftInfo = (): ShiftInfo => {
  const now = new Date();
  const utcTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istTotalMinutes = (utcTotalMinutes + 330) % 1440;
  const istHours = Math.floor(istTotalMinutes / 60);
  const istMinutes = istTotalMinutes % 60;

  const ampm = istHours >= 12 ? 'PM' : 'AM';
  const displayHours = istHours % 12 || 12;
  const formattedTimeIST = `${displayHours}:${istMinutes < 10 ? '0' : ''}${istMinutes} ${ampm}`;

  // Remove all 9:00 AM & 6:00 PM restrictions. Always allow check in and never force shift end.
  return {
    isCheckInAllowed: true,
    isPastShiftEnd: false,
    isBeforeShiftStart: false,
    isAfterShiftEnd: false,
    punctualityLabel: 'On-Time',
    statusKey: 'present',
    istHours,
    istMinutes,
    formattedTimeIST,
    windowMessage: 'Check-in window active',
  };
};

export const isShiftConcluded = (): boolean => {
  return false;
};

/**
 * Accurately formats an ISO string or timestamp to Indian Standard Time (IST - UTC+5:30)
 * in 12-hour AM/PM format (e.g., "10:55 AM").
 */
export const formatTimeIST = (raw?: string | null): string => {
  if (!raw) return '--:--';
  if (raw.includes('AM') || raw.includes('PM')) return raw;
  try {
    let clean = raw.trim();
    if (clean.includes('T') && !clean.endsWith('Z')) {
      clean = clean + 'Z';
    }
    const dt = new Date(clean);
    if (!isNaN(dt.getTime())) {
      // Convert UTC ms to IST ms (UTC + 5 hours 30 mins)
      const istMs = dt.getTime() + 5.5 * 3600000;
      const istDate = new Date(istMs);
      const hours = istDate.getUTCHours();
      const mins = istDate.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${h12}:${mins < 10 ? '0' : ''}${mins} ${ampm}`;
    }
  } catch {}
  return raw;
};
