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
  punctualityLabel: 'On-Time (Present)' | 'Half-Day';
  statusKey: 'present' | 'half_day';
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

  // Shift Check-In Punctuality Rules (IST):
  // - Check-in between 9:00 AM and 10:00 AM IST (and before 9:00 AM) = Present
  // - Check-in after 10:00 AM IST (istTotalMinutes > 600) = Half-Day
  const isAfterTenAM = istTotalMinutes > 600; // 10:00 AM = 600 minutes from midnight

  const statusKey: 'present' | 'half_day' = isAfterTenAM ? 'half_day' : 'present';
  const punctualityLabel = isAfterTenAM ? 'Half-Day' : 'On-Time (Present)';
  const windowMessage = isAfterTenAM
    ? 'Checked in after 10:00 AM IST (Marked Half-Day)'
    : 'Checked in between 09:00 AM - 10:00 AM IST (Marked Present)';

  return {
    isCheckInAllowed: true,
    isPastShiftEnd: false,
    isBeforeShiftStart: false,
    isAfterShiftEnd: false,
    punctualityLabel,
    statusKey,
    istHours,
    istMinutes,
    formattedTimeIST,
    windowMessage,
  };
};

export const isShiftConcluded = (): boolean => {
  return false;
};

/**
 * Ensures employee ID is cleanly formatted as "b4s/Adani/[ID]"
 */
export const formatEmployeeId = (empId?: string | null): string => {
  if (!empId) return 'b4s/Adani/01';
  const clean = empId.trim();
  if (clean.toLowerCase().startsWith('b4s/adani/')) {
    return `b4s/Adani/${clean.substring(10)}`;
  }
  if (clean.toLowerCase().startsWith('b4s/')) {
    return `b4s/Adani/${clean.substring(4)}`;
  }
  return `b4s/Adani/${clean}`;
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
