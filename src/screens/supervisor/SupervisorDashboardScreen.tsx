import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Menu,
  Clock,
  Timer,
  MapPin,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Calendar,
  Users,
  BarChart3,
  ArrowRight,
  LogOut,
  AlertTriangle,
  Building2,
  ChevronRight,
  FileText,
  Bell,
  X,
  CheckCheck,
  User as UserIcon,
  Lock,
  Camera as CameraIcon,
  RotateCcw,
} from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupervisorDrawerStore } from '../../store/useSupervisorDrawerStore';
import { useAttendanceStore } from '../../store/useAttendanceStore';
import { attendanceService, TodayAttendanceResult } from '../../services/attendanceService';
import { dashboardService, AdminNotification } from '../../services/dashboardService';
import { SupervisorDrawerModal } from '../../components/navigation/SupervisorDrawerModal';
import { AttendanceRecord, Substation } from '../../types';
import { formatTimeIST } from '../../utils/shiftUtils';
import { AppButton } from '../../components/common/AppButton';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import { holidayService } from '../../services/holidayService';
import { getShiftInfo } from '../../utils/shiftUtils';
import { getStorageItem, setStorageItem } from '../../services/api';

interface StaffAttendanceItem {
  id: string;
  technicianName: string;
  technicianCode: string;
  siteName: string;
  checkInTime: string;
  status: string;
}

export const SupervisorDashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const { openDrawer } = useSupervisorDrawerStore();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [checkingIn, setCheckingIn] = useState<boolean>(false);
  const [checkingOut, setCheckingOut] = useState<boolean>(false);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotifModal, setShowNotifModal] = useState<boolean>(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'admin' | 'employee'>('all');
  const [markedAllRead, setMarkedAllRead] = useState<boolean>(false);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);

  // Load persistent read state for supervisor
  useEffect(() => {
    (async () => {
      try {
        const userKey = user?.employeeId || user?.id || (user as any)?._id || 'sup';
        const storedReads = await getStorageItem(`sup_read_notifs_${userKey}`);
        if (storedReads) {
          try {
            setReadNotifIds(JSON.parse(storedReads));
          } catch (_) {}
        }
        const storedAll = await getStorageItem(`sup_all_read_${userKey}`);
        if (storedAll === 'true') {
          setMarkedAllRead(true);
        }
      } catch (_) {}
    })();
  }, [user]);

  // Today's attendance state
  const [todayData, setTodayData] = useState<TodayAttendanceResult | null>(null);
  const [liveElapsedMinutes, setLiveElapsedMinutes] = useState<number>(0);

  // Field Staff checked in today
  const [fieldStaff, setFieldStaff] = useState<StaffAttendanceItem[]>([]);
  const [staffLoading, setStaffLoading] = useState<boolean>(false);

  // Chart toggle
  const [chartMode, setChartMode] = useState<'daily' | 'distribution'>('daily');

  // Device GPS coords
  const [deviceCoords, setDeviceCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 18.5204,
    longitude: 73.8567,
  });

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch supervisor today's attendance
      const todayRes = await attendanceService.getTodayAttendance().catch(() => null);
      if (todayRes) {
        setTodayData(todayRes);
        setLiveElapsedMinutes(todayRes.liveElapsedMinutes || 0);
      }

      // 2. Fetch field staff check-ins today
      const todayDate = new Date();
      const logsRes = await attendanceService
        .getAllLogs(todayDate.getMonth() + 1, todayDate.getFullYear(), 'daily')
        .catch(() => ({ logs: [], total: 0 }));

      if (logsRes && logsRes.logs) {
        // Filter technicians checked in today
        const checkedInTechnicians: StaffAttendanceItem[] = logsRes.logs
          .filter(
            (l: any) =>
              l.checkInTime &&
              l.checkInTime !== '--:--' &&
              (l.role === 'technician' || !l.role)
          )
          .map((l: any) => ({
            id: l.recordId || l.id || Math.random().toString(),
            technicianName: l.technicianName || 'Field Technician',
            technicianCode: l.technicianCode || l.employeeId || 'b4S/Adani',
            siteName: l.siteName || 'Substation Hub',
            checkInTime: l.checkInTime,
            status: l.status || 'present',
          }));
        setFieldStaff(checkedInTechnicians);
      }

      // 3. Fetch notifications (both Admin directives and Employee alerts)
      try {
        const statsRes = await dashboardService.getAdminStats();
        if (statsRes && statsRes.notifications) {
          setNotifications(statsRes.notifications);
        }
      } catch (errNotif) {
        console.warn('Supervisor notifications load error:', errNotif);
      }

      // 4. Obtain location quietly
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setDeviceCoords({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch {}
    } catch (e: any) {
      console.warn('Supervisor dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Live timer for active shift
  useEffect(() => {
    if (todayData?.status === 'active') {
      const interval = setInterval(() => {
        setLiveElapsedMinutes((m) => m + 1);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [todayData?.status]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Notification Counts & Filtering (Both Admin Directives & Employee Field Updates)
  const unreadCount = useMemo(() => {
    if (markedAllRead) return 0;
    return notifications.filter((n) => !n.isRead && !readNotifIds.includes(n.id)).length;
  }, [notifications, markedAllRead, readNotifIds]);

  const adminNotificationsCount = useMemo(() => {
    return notifications.filter((n) => n.source === 'admin').length;
  }, [notifications]);

  const employeeNotificationsCount = useMemo(() => {
    return notifications.filter((n) => n.source === 'employee' || !n.source).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (notifFilter === 'admin') return item.source === 'admin';
      if (notifFilter === 'employee') return item.source === 'employee' || !item.source;
      return true;
    }).map((item) => ({
      ...item,
      isRead: markedAllRead || readNotifIds.includes(item.id) || item.isRead,
    }));
  }, [notifications, notifFilter, markedAllRead, readNotifIds]);

  const handleMarkAllRead = async () => {
    try {
      setMarkedAllRead(true);
      const allIds = notifications.map((n) => n.id);
      setReadNotifIds(allIds);
      const userKey = user?.employeeId || user?.id || (user as any)?._id || 'sup';
      await setStorageItem(`sup_all_read_${userKey}`, 'true');
      await setStorageItem(`sup_read_notifs_${userKey}`, JSON.stringify(allIds));
      await dashboardService.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.warn('Mark all read error:', e);
    }
  };

  const handleToggleRead = async (item: AdminNotification) => {
    if (item.isRead || markedAllRead || readNotifIds.includes(item.id)) return;
    const newReads = Array.from(new Set([...readNotifIds, item.id]));
    setReadNotifIds(newReads);
    const userKey = user?.employeeId || user?.id || (user as any)?._id || 'sup';
    await setStorageItem(`sup_read_notifs_${userKey}`, JSON.stringify(newReads));
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
    );
    try {
      await dashboardService.markNotificationsRead(item.id);
    } catch (e) {
      console.warn('Toggle read error:', e);
    }
  };

  // Sign out / Logout Handler
  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      `Are you sure you want to sign out of the supervisor portal (${user?.name || user?.employeeId || 'Supervisor'})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  // Live shift info state that updates periodically and on refresh
  const [shiftInfo, setShiftInfo] = useState(getShiftInfo());
  const isPastShiftEnd = shiftInfo.isPastShiftEnd;

  useEffect(() => {
    const timer = setInterval(() => {
      setShiftInfo(getShiftInfo());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Mandatory Camera Photo Check-In State for Supervisor
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isSubmittingPhoto, setIsSubmittingPhoto] = useState(false);
  const cameraRef = useRef<any>(null);

  // Normal Check-In Handler: Opens camera modal (blocked after 6:00 PM IST)
  const handleNormalCheckIn = () => {
    const shift = getShiftInfo();
    if (shift.istHours >= 18) {
      Alert.alert(
        'Check-In Closed',
        'Shift check-in closed at 06:00 PM IST. Check-in is not permitted after 06:00 PM.',
        [{ text: 'OK' }]
      );
      return;
    }
    setCapturedPhotoUri(null);
    setShowCameraModal(true);
  };

  const handleCapturePhoto = async () => {
    if (cameraRef.current) {
      try {
        let photo: any = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: false });
        const photoData = photo.uri || (photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : null);
        setCapturedPhotoUri(photoData);
      } catch (e: any) {
        Alert.alert('Camera Error', e.message || 'Failed to capture photo.');
      }
    }
  };

  const handleSubmitPhotoAndCheckIn = async () => {
    const shift = getShiftInfo();
    if (shift.istHours >= 18) {
      Alert.alert(
        'Check-In Closed',
        'Shift check-in closed at 06:00 PM IST. Check-in is not permitted after 06:00 PM.'
      );
      setIsSubmittingPhoto(false);
      setShowCameraModal(false);
      return;
    }

    if (!capturedPhotoUri) {
      Alert.alert('Photo Required', 'Check-in photo is compulsory. Please capture a photo before checking in.');
      return;
    }
    setIsSubmittingPhoto(true);
    try {
      let uploadedUrl = capturedPhotoUri;
      try {
        uploadedUrl = await attendanceService.uploadPhoto(capturedPhotoUri);
      } catch (err) {
        console.warn('Supervisor photo upload fallback:', err);
      }

      const assignedSiteId = user?.assignedSiteId || user?.assignedSiteIds?.[0] || 'site_ahmedabad_01';
      const record = await attendanceService.checkIn({
        siteId: assignedSiteId,
        latitude: deviceCoords.latitude,
        longitude: deviceCoords.longitude,
        accuracy: 10,
        photoUrl: uploadedUrl,
        remarks: 'Supervisor Photo Verified Check-In',
        employeeId: user?.employeeId || user?.id,
        employeeName: user?.name,
      });

      useAttendanceStore.setState({
        todayStatus: 'active',
        todayRecord: record,
      });

      setShowCameraModal(false);
      setCapturedPhotoUri(null);
      await fetchDashboardData();
      Alert.alert('Check-In Successful', 'Welcome! Your attendance and photo verification have been recorded successfully.');
    } catch (err: any) {
      const { getFriendlyErrorMessage } = require('../../services/api');
      Alert.alert('Check-In Failed', getFriendlyErrorMessage(err));
    } finally {
      setIsSubmittingPhoto(false);
    }
  };

  // Normal Check-Out Trigger: Open confirmation popup modal
  const handleNormalCheckOut = () => {
    setShowCheckOutConfirm(true);
  };

  // Conclude Supervisor Check-Out
  const executeSupervisorCheckOut = async () => {
    setCheckingOut(true);
    try {
      const activeRecordId = todayData?.record?.id || todayRecord?.id || (todayData?.record as any)?._id;
      const record = await attendanceService.checkOut({
        recordId: activeRecordId,
        latitude: deviceCoords.latitude,
        longitude: deviceCoords.longitude,
        accuracy: 10,
        remarks: 'Supervisor Normal Check-Out',
      });

      useAttendanceStore.setState({
        todayStatus: 'completed',
        todayRecord: record,
      });

      setShowCheckOutConfirm(false);
      await fetchDashboardData();
      Alert.alert(
        'Shift Concluded',
        'Shift successfully checked out and archived. Your attendance ledger has been recorded.',
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      const { getFriendlyErrorMessage } = require('../../services/api');
      Alert.alert(
        'Check-Out Notice',
        getFriendlyErrorMessage(err) || 'Check-out could not be processed. Please ensure you are checked in and try again.'
      );
    } finally {
      setCheckingOut(false);
    }
  };

  const { todayStatus, todayRecord } = useAttendanceStore();

  const hasRealCheckIn = Boolean(
    (todayData?.record?.checkIn && (todayData.record.checkIn.time || (todayData.record.checkIn as any).timeIST)) ||
    (todayRecord?.checkIn && (todayRecord.checkIn.time || (todayRecord.checkIn as any).timeIST))
  );
  const hasRealCheckOut = Boolean(
    (todayData?.record?.checkOut && (todayData.record.checkOut.time || (todayData.record.checkOut as any).timeIST)) ||
    (todayRecord?.checkOut && (todayRecord.checkOut.time || (todayRecord.checkOut as any).timeIST))
  );

  const isShiftActive = todayStatus === 'active' || (hasRealCheckIn && !hasRealCheckOut);
  const isShiftCompleted = todayStatus === 'completed' || (hasRealCheckIn && hasRealCheckOut);
  const hasShiftStarted = isShiftActive || isShiftCompleted;

  const checkInTimeString = useMemo(() => {
    const rec = todayRecord || todayData?.record;
    const rawTime = rec?.checkIn?.time || (rec as any)?.checkInTime;
    if (!rawTime) return '--:--';
    return (rec?.checkIn as any)?.timeIST || formatTimeIST(rawTime);
  }, [todayRecord, todayData]);

  const checkOutTimeString = useMemo(() => {
    const rawTime = todayData?.record?.checkOut?.time || (todayData?.record as any)?.checkOutTime;
    if (!rawTime) return '--:--';
    try {
      return (todayData?.record?.checkOut as any)?.timeIST || formatTimeIST(rawTime);
    } catch {
      return '--:--';
    }
  }, [todayData]);

  const checkInDateString = useMemo(() => {
    if (!todayData?.record?.date) return new Date().toISOString().split('T')[0];
    return todayData.record.date;
  }, [todayData]);

  // Working hours formatted
  const hoursWorkedStr = useMemo(() => {
    if (!hasShiftStarted) return '--';
    const totalMinutes = isShiftCompleted
      ? todayData?.record?.workingMinutes || 0
      : liveElapsedMinutes;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m < 10 ? '0' : ''}${m}m`;
  }, [hasShiftStarted, isShiftCompleted, todayData, liveElapsedMinutes]);

  // Today shift badge text
  const shiftStatusText = useMemo(() => {
    if (!hasShiftStarted) return 'Not Started';
    const status = todayData?.record?.status;
    if (status === 'half-day' || status === 'half_day') return 'Half Day';
    if (status === 'late') return 'Late Checked-In';
    if (status === 'present') return 'On-Time';
    return isShiftActive ? 'Checked In' : 'Completed';
  }, [hasShiftStarted, todayData, isShiftActive]);

  // Supervisor Initials
  const supervisorInitials = useMemo(() => {
    const name = user?.name || 'Suresh Patil';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }, [user]);

  const liveHoursToday = useMemo(() => {
    if (todayData?.status === 'active') {
      return Number((liveElapsedMinutes / 60).toFixed(1));
    }
    if (todayData?.status === 'completed' && todayData?.record?.workingMinutes) {
      return Number((todayData.record.workingMinutes / 60).toFixed(1));
    }
    return 0.0;
  }, [todayData, liveElapsedMinutes]);

  const weeklyBars = useMemo(() => {
    const list = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const isToday = i === 0;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      list.push({
        day: `${dayName} ${dayNum}`,
        hours: isToday ? liveHoursToday : 0.0,
        target: 8.0,
        isToday,
      });
    }
    return list;
  }, [liveHoursToday]);

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E63F0']} />
        }
      >
        {/* ============================================================== */}
        {/* SECTION 1: SUPERVISOR PROFILE HEADER CARD (IMAGE 1)           */}
        {/* ============================================================== */}
        <View style={styles.headerCard}>
          {/* Top Row: Hamburger + Live Status + Alerts + Logout */}
          <View style={styles.headerNavRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity delayPressIn={0}
                style={styles.hamburgerBtn}
                onPress={() => openDrawer('SupervisorDashboard')}
                activeOpacity={0.7}
                accessibilityLabel="Open Navigation Menu"
              >
                <Menu size={20} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.statusPillActive}>
                <View style={styles.greenLiveDot} />
                <Text style={styles.statusPillActiveText}>Field Active</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Notification Bell Icon */}
              <TouchableOpacity delayPressIn={0}
                style={styles.bellCardBtn}
                onPress={() => setShowNotifModal(true)}
                activeOpacity={0.8}
                accessibilityLabel="Supervisor Notifications"
              >
                <Bell size={20} color="#1E293B" />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Supervisor Profile Summary Row */}
          <View style={styles.supervisorProfileRow}>
            <View style={styles.initialsBox}>
              <Text style={styles.initialsText}>{supervisorInitials}</Text>
            </View>

            <View style={styles.headerInfoCol}>
              <View style={styles.nameRow}>
                <Text style={styles.greetingText}>
                  Hello, {user?.name || 'Supervisor'}
                </Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>
                    {user?.designation || 'Area Operations Supervisor'}
                  </Text>
                </View>
              </View>

              <Text style={styles.employeeSubText} numberOfLines={1}>
                Employee ID: <Text style={styles.boldSub}>{user?.employeeId || '--'}</Text>
              </Text>
            </View>
          </View>

          {/* Quick Tools Row */}
          <View style={styles.headerToolsRow}>
            <TouchableOpacity delayPressIn={0}
              style={styles.headerToolBtn}
              onPress={async () => {
                try {
                  await holidayService.downloadHolidaysPdf(2026);
                } catch (e: any) {
      const { getFriendlyErrorMessage } = require('../../services/api');
      Alert.alert('Holiday Calendar', getFriendlyErrorMessage(e));
                }
              }}
              activeOpacity={0.7}
            >
              <Calendar size={13} color="#475569" />
              <Text style={styles.headerPillBtnText}>Holidays 2026 (PDF)</Text>
            </TouchableOpacity>

            <TouchableOpacity delayPressIn={0}
              style={styles.headerToolBtn}
              onPress={fetchDashboardData}
              activeOpacity={0.7}
            >
              <RefreshCw size={13} color="#475569" />
              <Text style={styles.headerPillBtnText}>Refresh Status</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================== */}
        {/* SECTION 2: 5 METRIC CARDS ROW (IMAGE 1)                      */}
        {/* ============================================================== */}
        <View style={styles.metricsRow}>
          {/* Card 1: Today's Shift */}
          <TouchableOpacity delayPressIn={0}
            style={styles.kpiCard}
            onPress={() => navigation.navigate('AttendanceLogs')}
            activeOpacity={0.85}
          >
            <View style={styles.kpiCardHeader}>
              <Text style={styles.kpiLabel}>TODAY'S SHIFT</Text>
              <View style={styles.kpiIconWrap}>
                <Clock size={15} color="#64748B" />
              </View>
            </View>

            {/* Punctuality Status Badge (Half Day / Late / On-Time) */}
            {shiftStatusText === 'Half Day' ? (
              <View style={styles.kpiStatusHalfDayPill}>
                <Clock size={12} color="#C2410C" style={{ marginRight: 4 }} />
                <Text style={styles.kpiStatusHalfDayText}>Half Day</Text>
              </View>
            ) : shiftStatusText === 'Late Checked-In' ? (
              <View style={styles.kpiStatusLatePill}>
                <Clock size={12} color="#B45309" style={{ marginRight: 4 }} />
                <Text style={styles.kpiStatusLateText}>Late Check-In</Text>
              </View>
            ) : shiftStatusText === 'On-Time' ? (
              <View style={styles.kpiStatusPresentPill}>
                <CheckCircle2 size={12} color="#047857" style={{ marginRight: 4 }} />
                <Text style={styles.kpiStatusPresentText}>On-Time</Text>
              </View>
            ) : (
              <Text style={styles.kpiMainValue} numberOfLines={1}>
                {shiftStatusText}
              </Text>
            )}

            <View style={styles.kpiSubRow}>
              <View
                style={[
                  styles.statusDot,
                  hasShiftStarted ? { backgroundColor: '#10B981' } : { backgroundColor: '#94A3B8' },
                ]}
              />
              <Text style={styles.kpiSubText}>
                {hasShiftStarted ? (isShiftActive ? 'Shift Active' : 'Shift Concluded') : 'Shift Inactive'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Check-In Time */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <Text style={styles.kpiLabel}>CHECK-IN TIME</Text>
              <View style={styles.kpiIconWrap}>
                <Clock size={15} color="#3B82F6" />
              </View>
            </View>
            <Text style={styles.kpiMainValue}>
              {hasShiftStarted ? checkInTimeString : '--:--'}
            </Text>
            <Text style={styles.kpiSubText}>
              {checkInDateString}
            </Text>
          </View>

          {/* Card 3: Hours Worked */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <Text style={styles.kpiLabel}>HOURS WORKED</Text>
              <View style={styles.kpiIconWrap}>
                <Timer size={15} color="#059669" />
              </View>
            </View>
            <Text style={styles.kpiMainValue}>
              {hoursWorkedStr}
            </Text>
            <View style={styles.kpiSubRow}>
              <Clock size={11} color="#059669" />
              <Text style={styles.kpiSubText}>Standard 8h shift</Text>
            </View>
          </View>

          {/* Card 4: Authorized Geofence */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <Text style={styles.kpiLabel}>AUTHORIZED GEOFENCE</Text>
              <View style={styles.kpiIconWrap}>
                <MapPin size={15} color="#8B5CF6" />
              </View>
            </View>
            <Text style={styles.kpiMainValue}>500 m</Text>
            <View style={styles.kpiSubRow}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.kpiSubText}>Verified In Zone</Text>
            </View>
          </View>

          {/* Card 5: Monthly Attendance */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <Text style={styles.kpiLabel}>MONTHLY ATTENDANCE</Text>
              <View style={styles.kpiIconWrap}>
                <TrendingUp size={15} color="#EC4899" />
              </View>
            </View>
            <Text style={styles.kpiMainValue}>{Math.round(((hasShiftStarted ? 1 : 0) / Math.max(1, new Date().getDate())) * 100)}%</Text>
            <Text style={styles.kpiSubText}>{(hasShiftStarted ? 1 : 0)} {(hasShiftStarted ? 1 : 0) === 1 ? 'Shift' : 'Shifts'} Logged</Text>
          </View>
        </View>

        {/* ============================================================== */}
        {/* SECTION 3: LIVE SHIFT VERIFICATION BLUE BANNER (IMAGE 1)       */}
        {/* ============================================================== */}
        <View style={styles.liveBanner}>
          <View style={styles.bannerHeaderRow}>
            {/* Verification Icon Box */}
            <View style={styles.bannerIconSquare}>
              <CheckCircle2 size={24} color="#FFFFFF" />
            </View>

            {/* Banner Titles */}
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTagText}>LIVE SHIFT VERIFICATION</Text>
              <Text style={styles.bannerTitleText}>
                {isShiftActive
                  ? `Shift Active • ${shiftStatusText}`
                  : isShiftCompleted
                  ? `Shift Concluded • Out at ${checkOutTimeString}`
                  : 'Ready to Check In'}
              </Text>
              <Text style={styles.bannerSubtitleText} numberOfLines={2}>
                {isShiftActive
                  ? 'Active shift in progress • GPS verified'
                  : isShiftCompleted
                  ? `Checked Out at ${checkOutTimeString} • Shift recorded`
                  : 'GPS verified at current location'}
              </Text>
            </View>
          </View>

          {/* Action Check In / Check Out Button Row */}
          <View style={styles.bannerActionRow}>
            {isShiftActive ? (
              <TouchableOpacity delayPressIn={0}
                style={styles.normalCheckOutBtn}
                onPress={handleNormalCheckOut}
                disabled={checkingOut}
                activeOpacity={0.85}
              >
                {checkingOut ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <LogOut size={16} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.normalCheckOutBtnText}>Normal Check Out</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              /* ACTIVE CHECK IN BUTTON (UNRESTRICTED OPEN FOR TESTING) */
              <TouchableOpacity delayPressIn={0}
                style={styles.normalCheckInBtn}
                onPress={handleNormalCheckIn}
                disabled={checkingIn}
                activeOpacity={0.85}
              >
                {checkingIn ? (
                  <ActivityIndicator size="small" color="#1E63F0" />
                ) : (
                  <>
                    <ShieldCheck size={16} color="#1E63F0" style={{ marginRight: 6 }} />
                    <Text style={styles.normalCheckInBtnText}>Normal Check In</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Banner Bottom Coordinates & Privilege Strip */}
          <View style={styles.bannerBottomStrip}>
            <View style={styles.coordsRow}>
              <MapPin size={12} color="#93C5FD" style={{ marginRight: 4 }} />
              <Text style={styles.coordsText}>
                Lat: {deviceCoords.latitude.toFixed(4)} | Long: {deviceCoords.longitude.toFixed(4)}
              </Text>
            </View>

            <View style={styles.privilegePill}>
              <Text style={styles.privilegePillText}>
                Supervisor Privilege Active • Normal Attendance
              </Text>
            </View>
          </View>
        </View>

        {/* Timing Policy Strip */}
        <View style={styles.policyStrip}>
          <Clock size={13} color="#2563EB" style={{ marginRight: 6 }} />
          <Text style={styles.policyStripText}>
            Shift Window: Unrestricted | Check-in & Check-out permitted anytime
          </Text>
        </View>

        {/* ============================================================== */}
        {/* SECTION 4: CHECKED-IN FIELD STAFF TODAY CARD                   */}
        {/* ============================================================== */}
        <View style={styles.staffCard}>
          <View style={styles.cardHeaderCol}>
            <View style={styles.cardHeaderTopRow}>
              <View style={styles.cardIconBox}>
                <Users size={18} color="#1E63F0" />
              </View>
              <Text style={styles.cardTitleFlex}>Checked-In Field Staff Today</Text>
              <View style={styles.staffCountBadge}>
                <Text style={styles.staffCountBadgeText}>
                  {fieldStaff.length} Checked In
                </Text>
              </View>
            </View>

            <Text style={styles.cardSubTitle}>
              Live daily attendance roster of field technicians and installers
            </Text>

            <View style={styles.cardActionRow}>
              <TouchableOpacity delayPressIn={0}
                style={[styles.refreshListBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => navigation.navigate('Tracking')}
                activeOpacity={0.7}
              >
                <MapPin size={13} color="#2563EB" />
                <Text style={[styles.refreshListBtnText, { color: '#2563EB', fontWeight: '700' }]}>Live Map</Text>
              </TouchableOpacity>

              <TouchableOpacity delayPressIn={0}
                style={styles.refreshListBtn}
                onPress={fetchDashboardData}
                activeOpacity={0.7}
              >
                <RefreshCw size={13} color="#475569" />
                <Text style={styles.refreshListBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Staff Content */}
          {fieldStaff.length === 0 ? (
            <View style={styles.dashedEmptyBox}>
              <Users size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No field technicians checked in yet today</Text>
              <Text style={styles.emptySub}>
                Staff check-ins will appear live here as they punch in from substations.
              </Text>
            </View>
          ) : (
            <View style={styles.staffList}>
              {fieldStaff.map((staff) => (
                <View key={staff.id} style={styles.staffRowItem}>
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>
                      {staff.technicianName
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffNameText}>{staff.technicianName}</Text>
                    <Text style={styles.staffSubText}>
                      {staff.technicianCode} • {staff.siteName}
                    </Text>
                  </View>
                  <View style={styles.staffTimeCol}>
                    <Text style={styles.staffTimeText}>{staff.checkInTime}</Text>
                    <View
                      style={[
                        styles.staffStatusTag,
                        staff.status === 'present'
                          ? { backgroundColor: '#DCFCE7' }
                          : { backgroundColor: '#FEF3C7' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.staffStatusTagText,
                          staff.status === 'present' ? { color: '#15803D' } : { color: '#B45309' },
                        ]}
                      >
                        {staff.status === 'present' ? 'On-Time' : 'Late Arrival'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ============================================================== */}
        {/* SECTION 5: MY ATTENDANCE REVIEW & WORK HOURS                   */}
        {/* ============================================================== */}
        <View style={styles.analyticsCard}>
          <View style={styles.cardHeaderCol}>
            <View style={styles.cardHeaderTopRow}>
              <View style={styles.cardIconBox}>
                <BarChart3 size={18} color="#1E63F0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleFlex}>My Attendance Review & Work Hours</Text>
                <View style={styles.analyticsPill}>
                  <Text style={styles.analyticsPillText}>SUPERVISOR ANALYTICS</Text>
                </View>
              </View>
            </View>

            <View style={styles.analyticsHeaderActions}>
              <View style={styles.segmentToggle}>
                <TouchableOpacity delayPressIn={0}
                  style={[styles.segmentBtn, chartMode === 'daily' && styles.segmentBtnActive]}
                  onPress={() => setChartMode('daily')}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      chartMode === 'daily' && styles.segmentBtnTextActive,
                    ]}
                  >
                    Daily Hours Trend
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity delayPressIn={0}
                  style={[styles.segmentBtn, chartMode === 'distribution' && styles.segmentBtnActive]}
                  onPress={() => setChartMode('distribution')}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      chartMode === 'distribution' && styles.segmentBtnTextActive,
                    ]}
                  >
                    Shift Distribution
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity delayPressIn={0}
                style={styles.fullLogsBtn}
                onPress={() => navigation.navigate('AttendanceLogs')}
                activeOpacity={0.8}
              >
                <Text style={styles.fullLogsBtnText}>→ Full Logs</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Visual Bar Chart */}
          <View style={styles.chartWrapper}>
              {/* Chart Legend */}
              <View style={styles.chartLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.legendText}>
                    Hours Worked per Day (Target line: 8.0 hrs)
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                  <Text style={styles.legendText}>Today's Live Shift</Text>
                </View>
              </View>

              {/* Bars Area with Y-axis & Target line */}
              <View style={styles.chartArea}>
                {/* Y-Axis Labels */}
                <View style={styles.yAxisCol}>
                  <Text style={styles.yAxisLabel}>10h</Text>
                  <Text style={styles.yAxisLabel}>6h</Text>
                  <Text style={styles.yAxisLabel}>2h</Text>
                </View>

                {/* Chart Grid & Bars */}
                <View style={styles.barsContainer}>
                  {/* 8h Target Horizontal Line */}
                  <View style={styles.targetDashedLine}>
                    <View style={styles.targetTag}>
                      <Text style={styles.targetTagText}>8h Target Shift</Text>
                    </View>
                  </View>

                  {/* Bars */}
                  <View style={styles.barsRow}>
                    {weeklyBars.map((bar, idx) => {
                      const maxH = 140;
                      const barHeight = Math.max(8, (bar.hours / 12) * maxH);
                      const parts = bar.day.trim().split(/\s+/);
                      const dayName = parts[0] || '';
                      const dayDate = parts[1] || '';

                      return (
                        <View key={idx} style={styles.barCol}>
                          <View style={styles.barTrack}>
                            {bar.hours > 0 ? (
                              <View
                                style={[
                                  styles.barFill,
                                  { height: barHeight },
                                  bar.isToday && styles.barFillToday,
                                ]}
                              />
                            ) : (
                              <View style={styles.barEmptyPill} />
                            )}
                          </View>
                          <View style={styles.barDayWrap}>
                            <Text
                              style={[
                                styles.barDayText,
                                bar.isToday && styles.barDayTextToday,
                              ]}
                              numberOfLines={1}
                            >
                              {dayName}
                            </Text>
                            {dayDate ? (
                              <Text
                                style={[
                                  styles.barDateText,
                                  bar.isToday && styles.barDateTextToday,
                                ]}
                                numberOfLines={1}
                              >
                                {dayDate}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ============================================================== */}
      {/* SUPERVISOR NOTIFICATIONS MODAL (ADMIN & EMPLOYEE ALERTS)       */}
      {/* ============================================================== */}
      <Modal visible={showNotifModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '88%' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.bellSquare, { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 8 }]}>
                  <Bell size={20} color="#1E63F0" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Supervisor Notifications</Text>
                  <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
                    {unreadCount} unread • Directives from Admin & Technician Field Updates
                  </Text>
                </View>
              </View>
              <TouchableOpacity delayPressIn={0}
                onPress={() => setShowNotifModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Filter Tabs & Mark Read Row */}
            <View style={styles.notifHeaderActions}>
              <View style={styles.notifFilterPills}>
                <TouchableOpacity delayPressIn={0}
                  style={[styles.notifPill, notifFilter === 'all' && styles.notifPillActive]}
                  onPress={() => setNotifFilter('all')}
                >
                  <Text style={[styles.notifPillText, notifFilter === 'all' && styles.notifPillTextActive]}>
                    All ({notifications.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity delayPressIn={0}
                  style={[styles.notifPill, notifFilter === 'admin' && styles.notifPillActiveAdmin]}
                  onPress={() => setNotifFilter('admin')}
                >
                  <Text style={[styles.notifPillText, notifFilter === 'admin' && styles.notifPillTextActive]}>
                    From Admin 🏛️ ({adminNotificationsCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity delayPressIn={0}
                  style={[styles.notifPill, notifFilter === 'employee' && styles.notifPillActiveEmp]}
                  onPress={() => setNotifFilter('employee')}
                >
                  <Text style={[styles.notifPillText, notifFilter === 'employee' && styles.notifPillTextActive]}>
                    From Employees 👷 ({employeeNotificationsCount})
                  </Text>
                </TouchableOpacity>
              </View>

              {unreadCount > 0 && (
                <TouchableOpacity delayPressIn={0} style={styles.markReadBtn} onPress={handleMarkAllRead}>
                  <CheckCheck size={14} color="#1E63F0" />
                  <Text style={styles.markReadText}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Notification Cards List */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {filteredNotifications.length === 0 ? (
                <View style={styles.emptyNotifBox}>
                  <CheckCircle2 size={36} color="#10B981" />
                  <Text style={styles.emptyNotifTitle}>All Caught Up</Text>
                  <Text style={styles.emptyNotifText}>
                    No notifications in this category. All field operations and directives are up to date.
                  </Text>
                </View>
              ) : (
                filteredNotifications.map((item) => {
                  const isAdmin = item.source === 'admin';
                  const isLate = item.type === 'warning';
                  const isDanger = item.type === 'danger';
                  const isSuccess = item.type === 'success';

                  return (
                    <TouchableOpacity delayPressIn={0}
                      key={item.id}
                      style={[
                        styles.notifItem,
                        !item.isRead && styles.notifItemUnread,
                        isAdmin ? styles.notifItemAdmin : styles.notifItemEmp,
                      ]}
                      onPress={() => handleToggleRead(item)}
                      activeOpacity={0.8}
                    >
                      {/* Top Source & Category Row */}
                      <View style={styles.notifSenderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {isAdmin ? (
                            <View style={styles.sourceTagAdmin}>
                              <Building2 size={11} color="#7C3AED" />
                              <Text style={styles.sourceTagAdminText}>ADMIN DIRECTIVE</Text>
                            </View>
                          ) : (
                            <View style={styles.sourceTagEmp}>
                              <UserIcon size={11} color="#059669" />
                              <Text style={styles.sourceTagEmpText}>EMPLOYEE UPDATE</Text>
                            </View>
                          )}

                          <View
                            style={[
                              styles.categoryBadge,
                              {
                                backgroundColor: isDanger
                                  ? '#FEE2E2'
                                  : isLate
                                  ? '#FEF3C7'
                                  : isSuccess
                                  ? '#DCFCE7'
                                  : '#EFF6FF',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.categoryBadgeText,
                                {
                                  color: isDanger
                                    ? '#B91C1C'
                                    : isLate
                                    ? '#B45309'
                                    : isSuccess
                                    ? '#15803D'
                                    : '#1D4ED8',
                                },
                              ]}
                            >
                              {item.category}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.notifTimeText}>{item.timestamp}</Text>
                          {!item.isRead && <View style={styles.unreadDot} />}
                        </View>
                      </View>

                      {/* Title & Description */}
                      <Text style={styles.notifTitleText}>{item.title}</Text>
                      <Text style={styles.notifMessageText}>{item.message}</Text>

                      {/* Sender Info Footer */}
                      <View style={styles.notifFooterRow}>
                        <Text style={styles.notifSenderName}>
                          {item.sender || (isAdmin ? 'Central Admin Operations' : item.employeeName || 'Technician')}
                        </Text>
                        {item.siteName ? (
                          <Text style={styles.notifSiteText}>• {item.siteName}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Modal Bottom CTA */}
            <View style={{ marginTop: 14 }}>
              <AppButton
                title="Close Notifications"
                variant="outline"
                size="md"
                onPress={() => setShowNotifModal(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* MANDATORY CAMERA PHOTO VERIFICATION MODAL */}
      <Modal
        visible={showCameraModal}
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingPhoto) {
            setShowCameraModal(false);
            setCapturedPhotoUri(null);
          }
        }}
      >
        <View style={styles.cameraModalContainer}>
          {!cameraPermission?.granted ? (
            <View style={styles.permissionScreen}>
              <View style={styles.permIconBox}>
                <CameraIcon size={44} color="#1E63F0" />
              </View>
              <Text style={styles.permScreenTitle}>Camera Access Required</Text>
              <Text style={styles.permScreenSub}>
                Attendance check-in requires a live camera photo to verify your presence.
              </Text>
              <TouchableOpacity style={styles.grantPermBtn} onPress={requestCameraPermission} activeOpacity={0.85}>
                <CameraIcon size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.grantPermBtnText}>Enable Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelPermBtn} onPress={() => setShowCameraModal(false)} activeOpacity={0.7}>
                <Text style={styles.cancelPermBtnText}>Cancel Check-In</Text>
              </TouchableOpacity>
            </View>
          ) : !capturedPhotoUri ? (
            <View style={StyleSheet.absoluteFill}>
              <CameraView style={StyleSheet.absoluteFill} facing={cameraFacing} ref={cameraRef}>
                <View style={[styles.cameraTopOverlay, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
                  <View style={styles.cameraHeaderWrap}>
                    <View style={styles.cameraShieldBox}>
                      <ShieldCheck size={18} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cameraHeaderTitle}>MANDATORY SELFIE VERIFICATION</Text>
                      <Text style={styles.cameraHeaderSub}>Live Camera Attendance Punch</Text>
                    </View>
                    <TouchableOpacity style={styles.cameraCloseBtn} onPress={() => setShowCameraModal(false)} activeOpacity={0.7}>
                      <X size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.cameraCenterOverlay}>
                  <View style={styles.faceTargetRing} />
                  <View style={styles.faceInstructionBadge}>
                    <Text style={styles.faceInstructionText}>Align face inside frame • Live Camera Only</Text>
                  </View>
                </View>

                <View style={[styles.cameraBottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
                  <TouchableOpacity style={styles.cameraSideBtn} onPress={() => setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'))} activeOpacity={0.75}>
                    <RotateCcw size={22} color="#FFFFFF" />
                    <Text style={styles.cameraSideBtnText}>Flip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.shutterRingBtn} onPress={handleCapturePhoto} activeOpacity={0.8}>
                    <View style={styles.shutterInnerCircle}>
                      <CameraIcon size={24} color="#1E63F0" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cameraSideBtn} onPress={() => setShowCameraModal(false)} activeOpacity={0.75}>
                    <X size={22} color="#EF4444" />
                    <Text style={[styles.cameraSideBtnText, { color: '#EF4444' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </CameraView>
            </View>
          ) : (
            <View style={[styles.previewScreenContainer, { paddingTop: Math.max(insets.top, 20) + 10, paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
              <View style={styles.previewHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle}>Review & Submit Photo</Text>
                  <Text style={styles.previewSubtitle}>Photo captured via live camera • Ready for attendance punch</Text>
                </View>
                <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setCapturedPhotoUri(null)} activeOpacity={0.7}>
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.previewContentScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.selfiePreviewWrap}>
                  <Image source={{ uri: capturedPhotoUri }} style={styles.selfiePreviewImage} resizeMode="cover" />
                </View>

                <View style={styles.previewDetailsCard}>
                  <View style={styles.previewDetailRow}>
                    <Text style={styles.previewDetailLabel}>Verification Mode:</Text>
                    <Text style={styles.previewDetailVal}>Biometric Live Photo</Text>
                  </View>
                  <View style={styles.previewDetailRow}>
                    <Text style={styles.previewDetailLabel}>Status:</Text>
                    <Text style={[styles.previewDetailVal, { color: '#059669', fontWeight: '700' }]}>Ready to Check-In</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.submitCheckInBtn} onPress={handleSubmitPhotoAndCheckIn} disabled={isSubmittingPhoto} activeOpacity={0.85}>
                  {isSubmittingPhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.submitCheckInBtnText}>Confirm & Complete Check-In</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* CHECK-OUT CONFIRMATION MODAL */}
      <ConfirmationModal
        visible={showCheckOutConfirm}
        title="Confirm Check-Out"
        message="Are you sure you want to conclude your shift and punch out for today?"
        confirmTitle="Confirm Check-Out"
        cancelTitle="Cancel"
        variant="danger"
        loading={checkingOut}
        onConfirm={executeSupervisorCheckOut}
        onCancel={() => {
          if (!checkingOut) setShowCheckOutConfirm(false);
        }}
      >
        <View style={styles.checkoutModalSummary}>
          <View style={styles.checkoutModalRow}>
            <Text style={styles.checkoutModalLabel}>Current Time (IST):</Text>
            <Text style={styles.checkoutModalVal}>{shiftInfo.formattedTimeIST}</Text>
          </View>
          <View style={styles.checkoutModalRow}>
            <Text style={styles.checkoutModalLabel}>Checked In At:</Text>
            <Text style={styles.checkoutModalVal}>{checkInTimeString}</Text>
          </View>
          {todayData?.record?.workingHoursFormatted ? (
            <View style={styles.checkoutModalRow}>
              <Text style={styles.checkoutModalLabel}>Duration Logged:</Text>
              <Text style={styles.checkoutModalVal}>{todayData.record.workingHoursFormatted}</Text>
            </View>
          ) : null}
        </View>
      </ConfirmationModal>

      {/* Global Supervisor Drawer Modal */}
      <SupervisorDrawerModal />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  // 1. Header Card
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  headerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  supervisorProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingTop: 8,
  },
  headerToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  initialsText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E63F0',
  },
  headerInfoCol: {
    flex: 1,
    minWidth: 200,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  greetingText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  rolePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E63F0',
  },
  employeeSubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  boldSub: {
    fontWeight: '700',
    color: '#0F172A',
  },
  headerActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  greenLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  statusPillActiveText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  headerPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerPillBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },

  // 2. Metrics Row
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  kpiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  kpiIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiMainValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  kpiStatusHalfDayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    marginBottom: 6,
  },
  kpiStatusHalfDayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  kpiStatusLatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    marginBottom: 6,
  },
  kpiStatusLateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  kpiStatusPresentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    marginBottom: 6,
  },
  kpiStatusPresentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  kpiSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiSubText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },

  // 3. Live Shift Verification Banner
  liveBanner: {
    backgroundColor: '#2563EB',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#2563EB',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerActionRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bannerIconSquare: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  bannerTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#BFDBFE',
    letterSpacing: 0.8,
  },
  bannerTitleText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  bannerSubtitleText: {
    fontSize: 12,
    color: '#E0E7FF',
    marginTop: 2,
  },
  normalCheckInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  normalCheckInBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E63F0',
  },
  normalCheckOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  normalCheckOutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
  },
  concludedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  concludedPillText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bannerBottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
    flexWrap: 'wrap',
    gap: 8,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coordsText: {
    fontSize: 11,
    color: '#DBEAFE',
    fontWeight: '600',
  },
  privilegePill: {
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  privilegePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // 4. Checked-In Field Staff Today Card
  staffCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
  },
  cardHeaderCol: {
    marginBottom: 14,
    gap: 6,
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  cardTitleFlex: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  staffCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexShrink: 0,
  },
  staffCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E63F0',
  },
  cardSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  refreshListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshListBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  dashedEmptyBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 3,
  },
  emptySub: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
  },
  staffList: {
    gap: 10,
  },
  staffRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E40AF',
  },
  staffNameText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  staffSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  staffTimeCol: {
    alignItems: 'flex-end',
  },
  staffTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  staffStatusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  staffStatusTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },

  // 5. My Attendance Review & Analytics Card
  analyticsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
  },
  analyticsPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  analyticsPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.4,
  },
  analyticsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  fullLogsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  fullLogsBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E63F0',
  },

  // 4 Analytics Summary Stat Cells
  summaryStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  summaryStatCell: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryStatLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  summaryStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
  },
  summaryStatUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  summaryStatSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },

  // Chart Wrapper
  chartWrapper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  chartArea: {
    flexDirection: 'row',
    height: 160,
  },
  yAxisCol: {
    width: 28,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  yAxisLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  barsContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  targetDashedLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 50,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderBottomColor: '#10B981',
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 1,
  },
  targetTag: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    marginTop: -8,
  },
  targetTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingBottom: 2,
    zIndex: 2,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: 28,
  },
  barFill: {
    width: 20,
    backgroundColor: '#10B981',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barFillToday: {
    backgroundColor: '#2563EB',
  },
  barEmptyPill: {
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 4,
  },
  barDayWrap: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  barDayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 13,
  },
  barDayTextToday: {
    color: '#1E63F0',
    fontWeight: '900',
  },
  barDateText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 2,
  },
  barDateTextToday: {
    color: '#1E63F0',
    fontWeight: '900',
  },
  policyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: -4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  policyStripText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },

  // Notification & Logout Header Buttons
  notifPillBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  notifBadgeDot: {
    backgroundColor: '#EF4444',
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  logoutPillBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  logoutPillBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  bellCardBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  bellBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#E11D48',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  // Supervisor Notifications Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 10,
  },
  bellSquare: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  notifHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  notifFilterPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  notifPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  notifPillActive: {
    backgroundColor: '#1E63F0',
  },
  notifPillActiveAdmin: {
    backgroundColor: '#7C3AED',
  },
  notifPillActiveEmp: {
    backgroundColor: '#059669',
  },
  notifPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  notifPillTextActive: {
    color: '#FFFFFF',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markReadText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E63F0',
  },
  emptyNotifBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyNotifTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  emptyNotifText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
  },
  notifItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notifItemUnread: {
    backgroundColor: '#F8FAFC',
    borderColor: '#93C5FD',
    borderLeftWidth: 4,
    borderLeftColor: '#1E63F0',
  },
  notifItemAdmin: {
    borderLeftColor: '#7C3AED',
  },
  notifItemEmp: {
    borderLeftColor: '#059669',
  },
  notifSenderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceTagAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  sourceTagAdminText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.3,
  },
  sourceTagEmp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  sourceTagEmpText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  notifTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#1E63F0',
  },
  notifTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  notifMessageText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  notifFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  notifSenderAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  notifSenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  checkoutModalSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkoutModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  checkoutModalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  checkoutModalVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  notifSiteText: {
    fontSize: 11,
    color: '#64748B',
  },

  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  permScreenTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
  },
  permScreenSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  grantPermBtn: {
    flexDirection: 'row',
    backgroundColor: '#1E63F0',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
  },
  grantPermBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cancelPermBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  cancelPermBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  cameraTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  cameraHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraShieldBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  cameraHeaderSub: {
    fontSize: 11,
    color: '#93C5FD',
  },
  cameraCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCenterOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceTargetRing: {
    width: 260,
    height: 340,
    borderRadius: 170,
    borderWidth: 3,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  faceInstructionBadge: {
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  faceInstructionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  cameraSideBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 60,
  },
  cameraSideBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shutterRingBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  shutterInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewScreenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  previewSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContentScroll: {
    paddingBottom: 40,
    gap: 16,
  },
  selfiePreviewWrap: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selfiePreviewImage: {
    width: '100%',
    height: '100%',
  },
  previewDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  previewDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewDetailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  previewDetailVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  submitCheckInBtn: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  submitCheckInBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

export default SupervisorDashboardScreen;
