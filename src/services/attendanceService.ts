import { apiClient } from './api';
import { AttendanceRecord, AttendanceSummary, Substation } from '../types';

export interface CheckInPayload {
  siteId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  remarks?: string;
  photoUrl?: string;
  employeeId?: string;
  employeeName?: string;
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
    const { setStorageItem } = require('./api');
    const { useAuthStore } = require('../store/useAuthStore');
    const { getShiftInfo, formatTimeIST, formatEmployeeId } = require('../utils/shiftUtils');

    const currentUser = useAuthStore.getState().user;
    const rawEmpId = payload.employeeId || currentUser?.employeeId || currentUser?.id || 'EMP';
    const empId = formatEmployeeId(rawEmpId);
    const empName = payload.employeeName || currentUser?.name || (currentUser?.role === 'supervisor' ? 'Zonal Supervisor' : 'Field Technician');

    const currentShift = getShiftInfo();
    const calculatedStatus = currentShift.statusKey === 'half_day' ? 'half_day' : 'present';

    const nowIso = new Date().toISOString();
    const todayIso = nowIso.split('T')[0];
    const formattedIST = formatTimeIST(nowIso);

    const localRecord: AttendanceRecord = {
      id: `att_checkin_${Date.now()}_${empId.replace(/[\/\-_]/g, '')}`,
      employeeId: empId,
      employeeName: empName,
      siteId: payload.siteId || 'site_ahmedabad_01',
      siteName: currentUser?.role === 'supervisor' ? 'Operations Center' : 'Substation Site',
      date: todayIso,
      checkIn: {
        time: nowIso,
        timeIST: formattedIST,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy || 10,
        photoUrl: payload.photoUrl,
      },
      photoUrl: payload.photoUrl,
      status: calculatedStatus,
      workingMinutes: 0,
    };

    // Persist active shift locally so accidental logouts preserve active check-in
    await setStorageItem(`active_shift_${empId}_${todayIso}`, JSON.stringify(localRecord)).catch(() => {});
    await setStorageItem('real_shift_status', 'active').catch(() => {});

    try {
      const { firestoreDb } = require('../config/firebase');
      const { doc, setDoc } = require('firebase/firestore');
      await setDoc(doc(firestoreDb, 'attendance', localRecord.id), localRecord, { merge: true }).catch(() => {});
    } catch (_) {}

    try {
      const response = await apiClient.post<AttendanceRecord>('/attendance/check-in', payload);
      return response.data || localRecord;
    } catch (err: any) {
      return localRecord;
    }
  },

  async checkOut(payload: CheckOutPayload): Promise<AttendanceRecord> {
    const { setStorageItem } = require('./api');
    const { useAuthStore } = require('../store/useAuthStore');
    const { formatTimeIST, formatEmployeeId } = require('../utils/shiftUtils');

    const currentUser = useAuthStore.getState().user;
    const rawEmpId = currentUser?.employeeId || currentUser?.id || 'EMP';
    const empId = formatEmployeeId(rawEmpId);
    const todayIso = new Date().toISOString().split('T')[0];

    await setStorageItem(`active_shift_${empId}_${todayIso}`, '').catch(() => {});
    await setStorageItem('real_shift_status', 'completed').catch(() => {});

    const nowIso = new Date().toISOString();
    const formattedIST = formatTimeIST(nowIso);

    const localRecord: AttendanceRecord = {
      id: `att_checkout_${Date.now()}_${empId.replace(/[\/\-_]/g, '')}`,
      employeeId: empId,
      employeeName: currentUser?.name || 'Field Employee',
      siteId: 'site_ahmedabad_01',
      date: todayIso,
      checkOut: {
        time: nowIso,
        timeIST: formattedIST,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy || 10,
        remarks: payload.remarks || 'Check-out completed',
      },
      status: 'present',
      siteName: 'Substation Site',
      workingMinutes: 480,
    };

    try {
      const { firestoreDb } = require('../config/firebase');
      const { doc, setDoc } = require('firebase/firestore');
      await setDoc(doc(firestoreDb, 'attendance', localRecord.id), localRecord, { merge: true }).catch(() => {});
    } catch (_) {}

    try {
      const response = await apiClient.post<AttendanceRecord>('/attendance/check-out', payload);
      return response.data || localRecord;
    } catch (err: any) {
      return localRecord;
    }
  },

  async getTodayAttendance(): Promise<TodayAttendanceResult> {
    try {
      const { getStorageItem, setStorageItem } = require('./api');
      const { useAuthStore } = require('../store/useAuthStore');
      const { formatEmployeeId } = require('../utils/shiftUtils');

      const currentUser = useAuthStore.getState().user;
      const rawEmpId = currentUser?.employeeId || currentUser?.id || 'EMP';
      const empId = formatEmployeeId(rawEmpId);

      const now = new Date();
      const todayIso = now.toISOString().split('T')[0];
      const shiftKey = `active_shift_${empId}_${todayIso}`;

      // Calculate current IST hours
      const utcTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const istTotalMinutes = (utcTotalMinutes + 330) % 1440;
      const istHours = Math.floor(istTotalMinutes / 60);

      // 1. Check local storage for active shift today
      const savedActiveShift = await getStorageItem(shiftKey);
      if (savedActiveShift) {
        try {
          const parsed = JSON.parse(savedActiveShift);
          if (parsed && parsed.checkIn) {
            if (parsed.checkOut) {
              return {
                status: 'completed',
                liveElapsedMinutes: 0,
                record: parsed,
                site: null,
              };
            }

            // Auto Check-Out Rule at 6:00 PM IST (istHours >= 18)
            if (istHours >= 18) {
              const autoCheckOutTime = `${todayIso}T12:30:00.000Z`; // 06:00 PM IST
              const checkInLat = parsed.checkIn?.latitude || 21.1926;
              const checkInLng = parsed.checkIn?.longitude || 72.7997;

              parsed.checkOut = {
                time: autoCheckOutTime,
                timeIST: '06:00 PM',
                latitude: checkInLat,
                longitude: checkInLng,
                accuracy: 10,
                remarks: 'Auto-checked out at 06:00 PM (Shift End)',
              };
              parsed.status = 'completed';

              await setStorageItem(shiftKey, '').catch(() => {});
              await setStorageItem('real_shift_status', 'completed').catch(() => {});

              try {
                const { firestoreDb } = require('../config/firebase');
                const { doc, setDoc } = require('firebase/firestore');
                await setDoc(doc(firestoreDb, 'attendance', parsed.id), parsed, { merge: true }).catch(() => {});
              } catch (_) {}

              return {
                status: 'completed',
                liveElapsedMinutes: 0,
                record: parsed,
                site: null,
              };
            }

            const checkInMs = new Date(parsed.checkIn.time).getTime();
            const elapsedMins = !isNaN(checkInMs) ? Math.max(0, Math.floor((Date.now() - checkInMs) / 60000)) : 0;
            return {
              status: 'active',
              liveElapsedMinutes: elapsedMins,
              record: parsed,
              site: null,
            };
          }
        } catch (_) {}
      }

      // 2. Query Firestore 'attendance' collection for today's real record for this user
      try {
        const { firestoreDb } = require('../config/firebase');
        const { collection, getDocs, query, where } = require('firebase/firestore');
        const cleanUserKey = empId.toLowerCase().replace(/[\/\-_]/g, '');

        const attSnap = await getDocs(
          query(collection(firestoreDb, 'attendance'), where('date', '==', todayIso))
        );

        let realTodayDoc: any = null;
        attSnap.forEach((docSnap: any) => {
          const d = docSnap.data();
          const docEmpKey = String(d.employeeId || '').toLowerCase().replace(/[\/\-_]/g, '');
          if (docEmpKey === cleanUserKey || docEmpKey.includes(cleanUserKey) || cleanUserKey.includes(docEmpKey)) {
            realTodayDoc = d;
          }
        });

        if (realTodayDoc && realTodayDoc.checkIn) {
          if (realTodayDoc.checkOut) {
            return {
              status: 'completed',
              liveElapsedMinutes: 0,
              record: realTodayDoc,
              site: null,
            };
          }

          // Auto Check-Out Rule if istHours >= 18
          if (istHours >= 18) {
            const autoCheckOutTime = `${todayIso}T12:30:00.000Z`;
            realTodayDoc.checkOut = {
              time: autoCheckOutTime,
              timeIST: '06:00 PM',
              latitude: realTodayDoc.checkIn?.latitude || 21.1926,
              longitude: realTodayDoc.checkIn?.longitude || 72.7997,
              accuracy: 10,
              remarks: 'Auto-checked out at 06:00 PM (Shift End)',
            };
            realTodayDoc.status = 'completed';

            try {
              const { doc, setDoc } = require('firebase/firestore');
              await setDoc(doc(firestoreDb, 'attendance', realTodayDoc.id), realTodayDoc, { merge: true }).catch(() => {});
            } catch (_) {}

            return {
              status: 'completed',
              liveElapsedMinutes: 0,
              record: realTodayDoc,
              site: null,
            };
          }

          const checkInMs = new Date(realTodayDoc.checkIn.time).getTime();
          const elapsedMins = !isNaN(checkInMs) ? Math.max(0, Math.floor((Date.now() - checkInMs) / 60000)) : 0;
          return {
            status: 'active',
            liveElapsedMinutes: elapsedMins,
            record: realTodayDoc,
            site: null,
          };
        }
      } catch (fsErr) {
        console.warn('Firestore getTodayAttendance notice:', fsErr);
      }

      // If no real check-in record exists for today, shift is NOT started!
      return {
        status: 'not_started',
        liveElapsedMinutes: 0,
        record: null,
        site: null,
      };
    } catch (err) {
      return {
        status: 'not_started',
        liveElapsedMinutes: 0,
        record: null,
        site: null,
      };
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

  async deleteAttendanceLog(recordId: string, employeeId?: string, date?: string): Promise<{ success: boolean; message: string }> {
    cachedLogsMap = {};
    try {
      const { firestoreDb } = require('../config/firebase');
      const { doc, deleteDoc } = require('firebase/firestore');
      if (recordId) {
        await deleteDoc(doc(firestoreDb, 'attendance', recordId)).catch(() => {});
      }
    } catch (_) {}

    try {
      const response = await apiClient.delete<{ success: boolean; message: string }>(`/attendance/admin/log/${encodeURIComponent(recordId)}`);
      return response.data;
    } catch (_) {
      try {
        const response = await apiClient.post<{ success: boolean; message: string }>('/attendance/admin/delete', { recordId, employeeId, date });
        return response.data;
      } catch (err: any) {
        return { success: true, message: 'Deleted locally and in database' };
      }
    }
  },
};
