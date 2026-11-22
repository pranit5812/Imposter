import { apiClient } from './api';
import { AttendanceRecord, AttendanceSummary, Substation } from '../types';

export interface CheckInPayload {
  siteId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  remarks?: string;
  photoUrl?: string;
}

export interface CheckOutPayload {
  recordId?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  remarks?: string;
}

export interface TodayAttendanceResult {
  status: 'not_started' | 'active' | 'completed';
  liveElapsedMinutes: number;
  record: AttendanceRecord | null;
  site: Substation | null;
  sites?: Substation[];
  assignedBy?: string;
  assignedByPhone?: string;
  assignedByRole?: string;
  assignedAt?: string;
}

export interface HistoryResult {
  summary: AttendanceSummary;
  records: AttendanceRecord[];
}

let cachedLogsMap: Record<string, { logs: any[]; total: number; timestamp: number }> = {};

export const attendanceService = {
  async uploadPhoto(photoUri: string): Promise<string> {
    if (!photoUri) {
      throw new Error('Photo URI is required');
    }

    let base64Data = photoUri;
    if (!photoUri.startsWith('data:') && !photoUri.startsWith('http://') && !photoUri.startsWith('https://')) {
      try {
        const resp = await fetch(photoUri);
        const blob = await resp.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('Blob read error, trying FormData upload:', e);
      }
    }

    // 1. If it's a Base64 data URI, send via fast JSON payload
    if (base64Data.startsWith('data:')) {
      try {
        const response = await apiClient.post<{ photoUrl: string; photoPath?: string }>('/attendance/upload-photo', {
          photoBase64: base64Data,
        });
        if (response.data && response.data.photoUrl) {
          return response.data.photoUrl;
        }
      } catch (err) {
        console.warn('Base64 photo upload failed, fallback to uri:', err);
      }
      return base64Data;
    }

    // 2. If it's a file URI, upload via FormData
    const formData = new FormData();
    const filename = photoUri.split('/').pop() || `selfie_${Date.now()}.jpg`;
    
    // @ts-ignore
    formData.append('photo', {
      uri: photoUri,
      name: filename,
      type: 'image/jpeg',
    });

    try {
      const response = await apiClient.post<{ photoUrl: string; photoPath?: string }>('/attendance/upload-photo', formData);
      return response.data.photoUrl || photoUri;
    } catch (e) {
      return photoUri;
    }
  },

  async checkIn(payload: CheckInPayload): Promise<AttendanceRecord> {
    const response = await apiClient.post<AttendanceRecord>('/attendance/check-in', payload);
    const { setStorageItem } = require('./api');
    await setStorageItem('real_shift_status', 'active');
    return response.data;
  },

  async checkOut(payload: CheckOutPayload): Promise<AttendanceRecord> {
    const response = await apiClient.post<AttendanceRecord>('/attendance/check-out', payload);
    const { setStorageItem } = require('./api');
    await setStorageItem('real_shift_status', 'completed');
    return response.data;
  },

  async getTodayAttendance(): Promise<TodayAttendanceResult> {
    try {
      const response = await apiClient.get<TodayAttendanceResult>('/attendance/today');

      // Override mock backend behavior:
      // Since backend might return a dummy active shift for demo purposes,
      // we strictly enforce 'not_started' unless there is an actual local state or it's a real check-in.
      const { getStorageItem } = require('./api');
      const localStatus = await getStorageItem('real_shift_status');

      if (!localStatus && response.data.status !== 'not_started') {
        response.data.status = 'not_started';
        response.data.record = null;
        response.data.liveElapsedMinutes = 0;
      }

      return response.data;
    } catch (err) {
      throw err;
    }
  },

  async getHistory(month?: number, year?: number, employeeId?: string): Promise<HistoryResult> {
    const params: Record<string, any> = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (employeeId) params.employeeId = employeeId;
    const response = await apiClient.get<HistoryResult>('/attendance/history', { params });
    return response.data;
  },

  getCachedAllLogs(month?: number, year?: number, period?: string, employeeId?: string): { logs: any[]; total: number } | null {
    const key = `${month || ''}_${year || ''}_${period || ''}_${employeeId || ''}`;
    const hit = cachedLogsMap[key];
    if (hit && Date.now() - hit.timestamp < 60000) {
      return hit;
    }
    return null;
  },

  async getAllLogs(month?: number, year?: number, period?: string, employeeId?: string, forceRefresh = false): Promise<{ logs: any[]; total: number }> {
    const key = `${month || ''}_${year || ''}_${period || ''}_${employeeId || ''}`;
    if (!forceRefresh && cachedLogsMap[key] && Date.now() - cachedLogsMap[key].timestamp < 60000) {
      return cachedLogsMap[key];
    }
    const params: Record<string, any> = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (period) params.period = period;
    if (employeeId) params.employeeId = employeeId;
    const response = await apiClient.get<{ logs: any[]; total: number }>('/attendance/admin/all-logs', { params });
    if (response.data) {
      cachedLogsMap[key] = { ...response.data, timestamp: Date.now() };
    }
    return response.data;
  },

  async adjustAttendance(payload: {
    recordId?: string;
    employeeId: string;
    date: string;
    status: string;
    siteName?: string;
    checkInTime?: string;
    checkOutTime?: string;
    duration?: string;
    adminRemarks?: string;
  }): Promise<{ success: boolean; message: string; record: any }> {
    cachedLogsMap = {};
    const response = await apiClient.post<{ success: boolean; message: string; record: any }>('/attendance/admin/adjust', payload);
    return response.data;
  },

  async markAttendance(payload: {
    employeeId: string;
    date: string;
    status: 'P' | 'A' | 'HD' | 'present' | 'absent' | 'half_day';
    isHalfDay?: boolean;
    attendanceCategory?: string;
    adminRemarks?: string;
  }): Promise<{ success: boolean; message: string; record: any }> {
    cachedLogsMap = {};
    const response = await apiClient.post<{ success: boolean; message: string; record: any }>('/attendance/admin/mark-attendance', payload);
    return response.data;
  },
};
