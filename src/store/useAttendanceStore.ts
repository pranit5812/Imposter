import { create } from 'zustand';
import { AttendanceRecord, Substation } from '../types';
import { attendanceService } from '../services/attendanceService';
import { getPendingOfflineTransactions, markTransactionSynced } from '../utils/offlineQueue';

interface AttendanceState {
  todayStatus: 'not_started' | 'active' | 'completed';
  todayRecord: AttendanceRecord | null;
  assignedSite: Substation | null;
  assignedSites: Substation[];
  liveElapsedSeconds: number;
  isLoading: boolean;
  error: string | null;
  pendingSyncCount: number;

  fetchTodayAttendance: () => Promise<void>;
  incrementTimer: () => void;
  syncOfflineQueue: () => Promise<void>;
  setShiftCompleted: (record: AttendanceRecord) => void;
  resetAttendance: () => void;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  todayStatus: 'not_started',
  todayRecord: null,
  assignedSite: null,
  assignedSites: [],
  liveElapsedSeconds: 0,
  isLoading: false,
  error: null,
  pendingSyncCount: 0,

  resetAttendance: () => {
    set({
      todayStatus: 'not_started',
      todayRecord: null,
      assignedSite: null,
      assignedSites: [],
      liveElapsedSeconds: 0,
      isLoading: false,
      error: null,
      pendingSyncCount: 0,
    });
  },

  fetchTodayAttendance: async () => {
    // Only set global isLoading on initial cold fetch to prevent UI flashing during background sync
    if (!get().todayRecord) {
      set({ isLoading: true, error: null });
    }
    try {
      const data = await attendanceService.getTodayAttendance();
      const hasRealCheckIn = Boolean(
        data?.record?.checkIn && (data.record.checkIn.time || (data.record.checkIn as any).timeIST)
      );
      const hasRealCheckOut = Boolean(
        data?.record?.checkOut && (data.record.checkOut.time || (data.record.checkOut as any).timeIST)
      );

      let realStatus: 'not_started' | 'active' | 'completed' = 'not_started';
      if (hasRealCheckIn && !hasRealCheckOut) {
        realStatus = 'active';
      } else if (hasRealCheckIn && hasRealCheckOut) {
        realStatus = 'completed';
      }

      // Auto Check-Out Rule: If current time is 6:00 PM IST or later (istHours >= 18) and employee is still checked in, auto check-out!
      const now = new Date();
      const utcTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const istTotalMinutes = (utcTotalMinutes + 330) % 1440;
      const istHours = Math.floor(istTotalMinutes / 60);

      if (realStatus === 'active' && istHours >= 18) {
        realStatus = 'completed';
        const todayIso = now.toISOString().split('T')[0];
        const autoCheckOutTime = `${todayIso}T12:30:00.000Z`; // 06:00 PM IST = 12:30:00 UTC
        const checkInLat = data.record?.checkIn?.latitude || 21.1926;
        const checkInLng = data.record?.checkIn?.longitude || 72.7997;

        const updatedRecord: AttendanceRecord = {
          ...data.record!,
          checkOut: {
            time: autoCheckOutTime,
            latitude: checkInLat,
            longitude: checkInLng,
            accuracy: 10,
            remarks: 'Auto-checked out at 06:00 PM (Shift End)',
          },
          status: 'present',
        };

        const { setStorageItem } = require('../services/api');
        await setStorageItem('real_shift_status', 'completed');

        try {
          await attendanceService.checkOut({
            latitude: checkInLat,
            longitude: checkInLng,
            accuracy: 10,
            remarks: 'Auto-checked out at 06:00 PM (Shift End)',
          }).catch(() => {});
        } catch (_) {}

        set({
          todayStatus: 'completed',
          todayRecord: updatedRecord,
          assignedSite: data?.site || null,
          assignedSites: data?.sites || (data?.site ? [data.site] : []),
          liveElapsedSeconds: 0,
          isLoading: false,
        });
        return;
      }

      const elapsedSec = realStatus === 'active' ? (data?.liveElapsedMinutes || 0) * 60 : 0;
      set({
        todayStatus: realStatus,
        todayRecord: realStatus !== 'not_started' ? data.record : null,
        assignedSite: data?.site || null,
        assignedSites: data?.sites || (data?.site ? [data.site] : []),
        liveElapsedSeconds: elapsedSec,
        isLoading: false,
      });

      // Check offline pending items
      const pending = await getPendingOfflineTransactions();
      set({ pendingSyncCount: pending.length });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'Failed to fetch attendance status',
      });
    }
  },

  incrementTimer: () => {
    if (get().todayStatus === 'active') {
      const now = new Date();
      const utcTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const istTotalMinutes = (utcTotalMinutes + 330) % 1440;
      const istHours = Math.floor(istTotalMinutes / 60);

      if (istHours >= 18) {
        get().fetchTodayAttendance();
        return;
      }
      set((state) => ({ liveElapsedSeconds: state.liveElapsedSeconds + 1 }));
    }
  },

  setShiftCompleted: (record: AttendanceRecord) => {
    set({
      todayStatus: 'completed',
      todayRecord: record,
    });
  },

  syncOfflineQueue: async () => {
    try {
      const pending = await getPendingOfflineTransactions();
      for (const item of pending) {
        if (item.type === 'check_in') {
          await attendanceService.checkIn({
            siteId: item.siteId,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            remarks: item.remarks,
            photoUrl: item.photoUri,
          });
        } else if (item.type === 'check_out') {
          await attendanceService.checkOut({
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            remarks: item.remarks,
          });
        }
        await markTransactionSynced(item.id);
      }
      const remaining = await getPendingOfflineTransactions();
      set({ pendingSyncCount: remaining.length });
      await get().fetchTodayAttendance();
    } catch (e) {
      console.warn('Sync failed:', e);
    }
  },
}));
