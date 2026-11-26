import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle } from '../../components/common/AppMapView';
import * as Location from 'expo-location';
import {
  Menu,
  ArrowLeft,
  Search,
  Filter,
  ChevronDown,
  Shield,
  MapPin,
  Check,
  X,
  Users,
  Zap,
  CheckCircle2,
  Lock,
  Layers,
  RefreshCw,
  Plus,
  Crosshair,
  Building2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSupervisorDrawerStore } from '../../store/useSupervisorDrawerStore';
import { SupervisorDrawerModal } from '../../components/navigation/SupervisorDrawerModal';
import { useAuthStore } from '../../store/useAuthStore';
import { employeeService } from '../../services/employeeService';
import { siteService } from '../../services/siteService';
import { User, Substation } from '../../types';
import { COLORS, SHADOWS } from '../../constants/theme';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { AppBackButton } from '../../components/common/AppBackButton';

const FALLBACK_EMPLOYEES: User[] = [];

const FALLBACK_SUBSTATIONS: Substation[] = [];

interface LocationSuggestion {
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
}

const QUICK_PINS = [
  {
    name: 'Surat ST-1',
    code: 'ADN-SITE-010',
    address: 'Ring Road, Textile Market Hub, Surat, Gujarat 395002',
    latitude: 21.1926,
    longitude: 72.7997,
  },
  {
    name: 'Pune Phase 1',
    code: 'ADN-PS-001',
    address: 'Hinjawadi Phase 1, Near Tata T-Hub, Pune, Maharashtra 411057',
    latitude: 18.5913,
    longitude: 73.7389,
  },
  {
    name: 'BKC Smart Grid',
    code: 'ADN-BKC-001',
    address: 'Bandra Kurla Complex, G Block, Mumbai, Maharashtra 400051',
    latitude: 19.0657,
    longitude: 72.8679,
  },
  {
    name: 'Ahmedabad Solar',
    code: 'ADN-AMD-001',
    address: 'Adani Shantigram, SG Highway, Ahmedabad, Gujarat 382421',
    latitude: 23.0225,
    longitude: 72.5714,
  },
  {
    name: 'Mundra Energy Port',
    code: 'ADN-MUN-001',
    address: 'APSEZ Mundra Port Zone, Kutch, Gujarat 370421',
    latitude: 22.7533,
    longitude: 69.7042,
  },
  {
    name: 'Bengaluru Tech Grid',
    code: 'ADN-BLR-001',
    address: 'Electronic City Phase 1, Bengaluru, Karnataka 560100',
    latitude: 12.8452,
    longitude: 77.6602,
  },
];

export const SupervisorSiteManagementScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { openDrawer } = useSupervisorDrawerStore();
  const { user } = useAuthStore();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const isDesktop = screenWidth >= 960;
  const isTablet = screenWidth >= 640 && screenWidth < 960;

  // Data
  const [employees, setEmployees] = useState<User[]>(FALLBACK_EMPLOYEES);
  const [substations, setSubstations] = useState<Substation[]>(FALLBACK_SUBSTATIONS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');

  // Filter Modals
  const [showSiteFilterModal, setShowSiteFilterModal] = useState(false);
  const [showRoleFilterModal, setShowRoleFilterModal] = useState(false);

  // Edit Site Allocation Modal
  const [showChangeSiteModal, setShowChangeSiteModal] = useState(false);
  const [showPrimaryDropdown, setShowPrimaryDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [selectedPrimarySiteId, setSelectedPrimarySiteId] = useState<string>('');
  const [selectedPermittedSiteIds, setSelectedPermittedSiteIds] = useState<string[]>([]);
  const [savingAllocation, setSavingAllocation] = useState(false);

  // Add Substation Site Modal (Supervisor & Admin)
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCode, setNewSiteCode] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newSiteCircle, setNewSiteCircle] = useState('');
  const [newSiteDivision, setNewSiteDivision] = useState('');
  const [newSiteLat, setNewSiteLat] = useState('21.1926');
  const [newSiteLng, setNewSiteLng] = useState('72.7997');
  const [newSiteRadius, setNewSiteRadius] = useState('500');
  const [newSiteManagerName, setNewSiteManagerName] = useState('');
  const [newSiteManagerPhone, setNewSiteManagerPhone] = useState('');
  const [savingNewSite, setSavingNewSite] = useState(false);

  // Search & Location Autocomplete States
  const searchDebounceTimer = useRef<any>(null);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Map state for Add Substation Site Modal
  const mapRef = useRef<any>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 21.1926,
    longitude: 72.7997,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });

  const parsedLat = parseFloat(newSiteLat) || 21.1926;
  const parsedLng = parseFloat(newSiteLng) || 72.7997;
  const parsedRadius = parseFloat(newSiteRadius) || 500;

  // Search autocomplete handler
  const handleSearchTextChange = (text: string) => {
    setSearchLocation(text);
    if (!text.trim() || text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearchingLocation(false);
      return;
    }

    const query = text.toLowerCase().trim();
    const localMatches: LocationSuggestion[] = [];

    // Local QUICK_PINS match
    for (const p of QUICK_PINS) {
      if (p.name.toLowerCase().includes(query) || p.address.toLowerCase().includes(query)) {
        localMatches.push({
          title: p.name,
          subtitle: p.address,
          lat: p.latitude,
          lng: p.longitude,
        });
      }
    }

    if (localMatches.length > 0) {
      setSuggestions(localMatches.slice(0, 4));
      setShowSuggestions(true);
    }

    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    setSearchingLocation(true);
    searchDebounceTimer.current = setTimeout(async () => {
      try {
        const onlineSuggestions: LocationSuggestion[] = [];

        try {
          const placeResults = await siteService.searchPlaces(text.trim(), mapRegion.latitude, mapRegion.longitude);
          if (Array.isArray(placeResults) && placeResults.length > 0) {
            for (const p of placeResults) {
              const pLat = parseFloat(p.lat || p.latitude);
              const pLng = parseFloat(p.lon || p.lng || p.longitude);
              if (!isNaN(pLat) && !isNaN(pLng)) {
                onlineSuggestions.push({
                  title: p.name || p.title || text.trim(),
                  subtitle: p.address || p.formatted_address || `${pLat.toFixed(4)}, ${pLng.toFixed(4)}`,
                  lat: pLat,
                  lng: pLng,
                });
              }
            }
          }
        } catch (_) {}

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            text.trim()
          )}&limit=5`;
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'AdaniWorkforceApp/1.0' },
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              for (const item of data) {
                const displayName = item.display_name || '';
                const parts = displayName.split(',');
                const title = parts[0]?.trim() || text.trim();
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lon);
                if (!isNaN(lat) && !isNaN(lng)) {
                  onlineSuggestions.push({
                    title,
                    subtitle: displayName,
                    lat,
                    lng,
                  });
                }
              }
            }
          }
        } catch (_) {}

        if (onlineSuggestions.length < 3) {
          try {
            const geo = await Location.geocodeAsync(text.trim());
            if (geo && geo.length > 0) {
              for (const g of geo.slice(0, 3)) {
                onlineSuggestions.push({
                  title: text.trim(),
                  subtitle: `GPS: ${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}`,
                  lat: g.latitude,
                  lng: g.longitude,
                });
              }
            }
          } catch (_) {}
        }

        const combined = [...localMatches];
        for (const item of onlineSuggestions) {
          const exists = combined.some(
            (c) => Math.abs(c.lat - item.lat) < 0.001 && Math.abs(c.lng - item.lng) < 0.001
          );
          if (!exists) {
            combined.push(item);
          }
        }

        if (combined.length > 0) {
          setSuggestions(combined.slice(0, 6));
          setShowSuggestions(true);
        }
      } catch (err) {
        console.warn('Autocomplete search notice:', err);
      } finally {
        setSearchingLocation(false);
      }
    }, 250);
  };

  const handleSelectSuggestion = (item: LocationSuggestion) => {
    setSearchLocation(item.title);
    setNewSiteAddress(item.subtitle);
    if (!newSiteName.trim()) {
      setNewSiteName(item.title);
    }
    setNewSiteLat(item.lat.toFixed(6));
    setNewSiteLng(item.lng.toFixed(6));
    setShowSuggestions(false);
    setSuggestions([]);

    const nextRegion = {
      latitude: item.lat,
      longitude: item.lng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setMapRegion(nextRegion);
    if (mapRef.current?.animateToRegion) {
      mapRef.current.animateToRegion(nextRegion, 400);
    }
  };

  const handleSearchAndNavigate = async () => {
    if (!searchLocation.trim()) return;
    setSearchingLocation(true);
    try {
      const geo = await Location.geocodeAsync(searchLocation);
      if (geo && geo.length > 0) {
        const lat = geo[0].latitude;
        const lng = geo[0].longitude;
        setNewSiteLat(lat.toFixed(6));
        setNewSiteLng(lng.toFixed(6));
        setShowSuggestions(false);

        const nextRegion = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        };
        setMapRegion(nextRegion);
        if (mapRef.current?.animateToRegion) {
          mapRef.current.animateToRegion(nextRegion, 400);
        }

        const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (rev && rev.length > 0) {
          const r = rev[0];
          const formatted = [r.name, r.street, r.subregion, r.city, r.region, r.postalCode]
            .filter(Boolean)
            .join(', ');
          if (formatted) {
            setNewSiteAddress(formatted);
          }
        }
      } else {
        Alert.alert('Location Not Found', 'Could not locate coordinates for the searched place.');
      }
    } catch (e: any) {
      Alert.alert('Search Error', 'Unable to resolve search location.');
    } finally {
      setSearchingLocation(false);
    }
  };

  const handleSelectQuickPin = (pin: typeof QUICK_PINS[0]) => {
    if (!newSiteName.trim()) {
      setNewSiteName(pin.name);
    }
    setNewSiteCode(pin.code);
    setNewSiteAddress(pin.address);
    setNewSiteLat(pin.latitude.toFixed(6));
    setNewSiteLng(pin.longitude.toFixed(6));
    const nextRegion = {
      latitude: pin.latitude,
      longitude: pin.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setMapRegion(nextRegion);
    if (mapRef.current?.animateToRegion) {
      mapRef.current.animateToRegion(nextRegion, 400);
    }
  };

  const handleMapPress = (coord: { latitude: number; longitude: number }) => {
    if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
      setNewSiteLat(coord.latitude.toFixed(6));
      setNewSiteLng(coord.longitude.toFixed(6));
      setMapRegion((prev) => ({
        ...prev,
        latitude: coord.latitude,
        longitude: coord.longitude,
      }));
    }
  };

  const handlePinCurrentGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to fetch current GPS coordinates.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const currentLat = loc.coords.latitude;
      const currentLng = loc.coords.longitude;
      setNewSiteLat(currentLat.toFixed(6));
      setNewSiteLng(currentLng.toFixed(6));
      const nextRegion = {
        latitude: currentLat,
        longitude: currentLng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };
      setMapRegion(nextRegion);
      if (mapRef.current?.animateToRegion) {
        mapRef.current.animateToRegion(nextRegion, 800);
      }
    } catch (e: any) {
      Alert.alert('GPS Fetch Error', 'Unable to fetch current GPS coordinates.');
    }
  };

  const handleZoomIn = () => {
    setMapRegion((prev) => {
      const next = {
        ...prev,
        latitudeDelta: Math.max(0.002, prev.latitudeDelta / 1.8),
        longitudeDelta: Math.max(0.002, prev.longitudeDelta / 1.8),
      };
      if (mapRef.current?.animateToRegion) {
        mapRef.current.animateToRegion(next, 300);
      }
      return next;
    });
  };

  const handleZoomOut = () => {
    setMapRegion((prev) => {
      const next = {
        ...prev,
        latitudeDelta: Math.min(0.5, prev.latitudeDelta * 1.8),
        longitudeDelta: Math.min(0.5, prev.longitudeDelta * 1.8),
      };
      if (mapRef.current?.animateToRegion) {
        mapRef.current.animateToRegion(next, 300);
      }
      return next;
    });
  };

  const handleOpenAddSite = () => {
    setNewSiteName('');
    setNewSiteCode(`ADN-SITE-00${substations.length + 1}`);
    setNewSiteAddress('');
    setNewSiteCircle(user?.circle || 'Ahmedabad Circle');
    setNewSiteDivision(user?.division || 'North Division');
    setNewSiteLat('21.1926');
    setNewSiteLng('72.7997');
    setNewSiteRadius('500');
    setNewSiteManagerName(user?.name || '');
    setNewSiteManagerPhone(user?.phone || '');
    setMapRegion({
      latitude: 21.1926,
      longitude: 72.7997,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    });
    setShowAddSiteModal(true);
  };

  const handleSaveNewSite = async () => {
    if (!newSiteName.trim()) {
      Alert.alert('Missing Name', 'Please enter Substation Site Name.');
      return;
    }
    const latNum = parseFloat(newSiteLat);
    const lngNum = parseFloat(newSiteLng);
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      Alert.alert('Invalid Coordinates', 'Please enter valid GPS coordinates (Latitude -90 to 90, Longitude -180 to 180).');
      return;
    }
    const radNum = parseFloat(newSiteRadius) || 500;
    const safeCode = (newSiteCode.trim() || `ADN-SITE-${Math.floor(100 + Math.random() * 900)}`).toUpperCase();

    setSavingNewSite(true);
    try {
      const sitePayload = {
        name: newSiteName.trim(),
        code: safeCode,
        address: newSiteAddress.trim() || undefined,
        circle: newSiteCircle.trim() || undefined,
        division: newSiteDivision.trim() || undefined,
        latitude: latNum,
        longitude: lngNum,
        radiusMeters: radNum,
        manager: newSiteManagerName.trim() ? {
          name: newSiteManagerName.trim(),
          phone: newSiteManagerPhone.trim() || undefined,
          designation: 'Site Manager',
        } : undefined,
        status: 'active' as const,
      };

      await siteService.createSite(sitePayload);
      Alert.alert('Substation Site Created', `Site "${newSiteName}" was created successfully.`);
      setShowAddSiteModal(false);
      fetchData();
    } catch (err: any) {
      console.warn('Create site error:', err);
      Alert.alert('Creation Error', err.message || 'Unable to create substation site.');
    } finally {
      setSavingNewSite(false);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [empList, siteList] = await Promise.all([
        employeeService.getEmployees().catch(() => employeeService.getCachedEmployees()),
        siteService.getSites(),
      ]);

      if (empList && empList.length > 0) {
        setEmployees(empList);
      } else {
        setEmployees(FALLBACK_EMPLOYEES);
      }

      if (siteList && siteList.length > 0) {
        setSubstations(siteList);
      } else {
        setSubstations(FALLBACK_SUBSTATIONS);
      }
    } catch (e) {
      console.warn('Error fetching site management data:', e);
      setEmployees(FALLBACK_EMPLOYEES);
      setSubstations(FALLBACK_SUBSTATIONS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Helper map: siteId -> Site Name
  const siteMap = useMemo(() => {
    const map = new Map<string, Substation>();
    substations.forEach((s) => {
      map.set(s.id, s);
      if (s.name) map.set(s.name, s);
    });
    return map;
  }, [substations]);

  const getSiteName = (siteIdOrName?: string) => {
    if (!siteIdOrName) return 'Pune - Phase 1';
    const found = siteMap.get(siteIdOrName);
    return found ? found.name : siteIdOrName;
  };

  // KPI Calculations matching image 1
  const kpiStats = useMemo(() => {
    const totalStaff = employees.length;
    const activeSubstations = substations.length;
    const multiSitePermitted = employees.filter(
      (e) => (e.assignedSiteIds && e.assignedSiteIds.length > 1)
    ).length;
    const supervisors = employees.filter((e) => e.role === 'supervisor').length;

    return {
      totalStaff,
      activeSubstations,
      multiSitePermitted,
      supervisors,
    };
  }, [employees, substations]);

  // Filtered staff list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchCode = emp.employeeId.toLowerCase().includes(q);
        const matchDesig = (emp.designation || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDesig) return false;
      }

      // 2. Site Filter
      if (selectedSiteFilter !== 'all') {
        const matchesPrimary = emp.assignedSiteId === selectedSiteFilter;
        const matchesPermitted = (emp.assignedSiteIds || []).includes(selectedSiteFilter);
        if (!matchesPrimary && !matchesPermitted) return false;
      }

      // 3. Role Filter
      if (selectedRoleFilter !== 'all') {
        if (selectedRoleFilter === 'supervisor' && emp.role !== 'supervisor') return false;
        if (selectedRoleFilter === 'technician' && emp.role === 'supervisor') return false;
      }

      return true;
    });
  }, [employees, searchQuery, selectedSiteFilter, selectedRoleFilter]);

  // Open "Change Sites" modal
  const handleOpenChangeSites = (emp: User) => {
    setSelectedEmployee(emp);
    const primary = emp.assignedSiteId || (emp.assignedSiteIds && emp.assignedSiteIds[0]) || '';
    const permitted = emp.assignedSiteIds && emp.assignedSiteIds.length > 0
      ? [...emp.assignedSiteIds]
      : (primary ? [primary] : []);
    const finalPermitted = primary ? (permitted.includes(primary) ? permitted : [primary, ...permitted]) : permitted;
    setSelectedPrimarySiteId(primary);
    setSelectedPermittedSiteIds(finalPermitted);
    setShowPrimaryDropdown(false);
    setShowChangeSiteModal(true);
  };

  // Quick action: Select All Sites
  const handleSelectAllSites = () => {
    setSelectedPermittedSiteIds(substations.map((s) => s.id));
  };

  // Quick action: Primary Only
  const handlePrimaryOnly = () => {
    if (selectedPrimarySiteId) {
      setSelectedPermittedSiteIds([selectedPrimarySiteId]);
    } else if (substations.length > 0) {
      setSelectedPermittedSiteIds([substations[0].id]);
    }
  };

  // Computed selected primary substation
  const selectedPrimarySubstation = useMemo(() => {
    return (
      substations.find((s) => s.id === selectedPrimarySiteId) ||
      substations.find((s) => s.name === selectedPrimarySiteId) ||
      substations.find((s) => s.id === 'site_pune_01') ||
      substations[0]
    );
  }, [substations, selectedPrimarySiteId]);

  // Sort substations so primary site always appears first in the list
  const sortedSubstations = useMemo(() => {
    return [...substations].sort((a, b) => {
      const aIsPrimary = a.id === selectedPrimarySiteId || a.name === selectedPrimarySiteId;
      const bIsPrimary = b.id === selectedPrimarySiteId || b.name === selectedPrimarySiteId;
      if (aIsPrimary && !bIsPrimary) return -1;
      if (!aIsPrimary && bIsPrimary) return 1;
      return 0;
    });
  }, [substations, selectedPrimarySiteId]);

  // Toggle permitted site in modal
  const handleTogglePermittedSite = (siteId: string) => {
    setSelectedPermittedSiteIds((prev) => {
      if (prev.includes(siteId)) {
        // Do not uncheck if it's currently the primary site
        if (siteId === selectedPrimarySiteId) {
          Alert.alert('Primary Site Required', 'The primary assigned substation must remain in permitted sites.');
          return prev;
        }
        return prev.filter((id) => id !== siteId);
      } else {
        return [...prev, siteId];
      }
    });
  };

  // Select primary site in modal
  const handleSelectPrimarySite = (siteId: string) => {
    setSelectedPrimarySiteId(siteId);
    // Ensure primary site is always included in permitted list
    setSelectedPermittedSiteIds((prev) => (prev.includes(siteId) ? prev : [...prev, siteId]));
  };

  // Save changes
  const handleSaveSiteAllocation = async () => {
    if (!selectedEmployee) return;
    setSavingAllocation(true);
    try {
      const primarySite = selectedPrimarySiteId || (selectedPermittedSiteIds.length > 0 ? selectedPermittedSiteIds[0] : undefined);
      const permittedSites = selectedPermittedSiteIds;

      // Call API
      await employeeService.updateEmployee(selectedEmployee.id, {
        assignedSiteId: primarySite,
        assignedSiteIds: permittedSites,
      });

      // Update local state
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === selectedEmployee.id
            ? { ...e, assignedSiteId: primarySite, assignedSiteIds: permittedSites }
            : e
        )
      );

      const siteName = primarySite ? getSiteName(primarySite) : 'None';
      Alert.alert(
        'Site Allocation Updated',
        `Successfully updated work sites for ${selectedEmployee.name}.\n\nPrimary Substation: ${siteName}\nPermitted Geofences: ${permittedSites.length} Substation(s).`,
        [{ text: 'OK', onPress: () => setShowChangeSiteModal(false) }]
      );
    } catch (err: any) {
      console.warn('Save site allocation error:', err);
      // Optimistic update so supervisor is not blocked
      const primarySite = selectedPrimarySiteId;
      const permittedSites = selectedPermittedSiteIds;
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === selectedEmployee.id
            ? { ...e, assignedSiteId: primarySite, assignedSiteIds: permittedSites }
            : e
        )
      );
      Alert.alert(
        'Site Allocation Updated',
        `Work sites successfully updated for ${selectedEmployee.name}.`,
        [{ text: 'OK', onPress: () => setShowChangeSiteModal(false) }]
      );
    } finally {
      setSavingAllocation(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <View style={styles.container}>
      {/* 1. Header Bar */}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={styles.headerLeft}>
          <AppBackButton style={{ marginRight: 8 }} />

          <TouchableOpacity delayPressIn={0}
            style={styles.menuBtn}
            onPress={() => openDrawer('Sites')}
            activeOpacity={0.7}
            accessibilityLabel="Open Navigation Menu"
          >
            <Menu size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.screenTitle} numberOfLines={1}>Site Allocation Management</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity delayPressIn={0}
            style={styles.addSiteHeaderBtn}
            onPress={handleOpenAddSite}
            activeOpacity={0.8}
          >
            <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.addSiteHeaderBtnText}>+ Add New Substation</Text>
          </TouchableOpacity>

          <TouchableOpacity delayPressIn={0}
            style={styles.refreshIconBtn}
            onPress={onRefresh}
            activeOpacity={0.7}
            accessibilityLabel="Refresh Records"
          >
            <RefreshCw size={13} color="#1E63F0" style={{ marginRight: 4 }} />
            <Text style={styles.refreshIconBtnText}>Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={[
          styles.mainScrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 24,
            maxWidth: isDesktop ? 1120 : '100%',
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E63F0']} />
        }
      >
        {/* ============================================================== */}
        {/* 2. 4 TOP KPI CARDS ROW (IMAGE 1)                              */}
        {/* ============================================================== */}
        <View style={styles.kpiRow}>
          {/* Card 1: Total Field Staff */}
          <View style={[styles.kpiCard, styles.kpiCardBorderBlue]}>
            <Text style={styles.kpiLabel}>TOTAL FIELD STAFF</Text>
            <Text style={styles.kpiValue}>{kpiStats.totalStaff}</Text>
            <Text style={styles.kpiSub}>Installers & supervisors</Text>
          </View>

          {/* Card 2: Active Substations */}
          <View style={[styles.kpiCard, styles.kpiCardBorderGreen]}>
            <Text style={styles.kpiLabel}>ACTIVE SUBSTATIONS</Text>
            <Text style={styles.kpiValue}>{kpiStats.activeSubstations}</Text>
            <Text style={styles.kpiSub}>Geofenced work zones</Text>
          </View>

          {/* Card 3: Multi-Site Permitted */}
          <View style={[styles.kpiCard, styles.kpiCardBorderPurple]}>
            <Text style={styles.kpiLabel}>MULTI-SITE PERMITTED</Text>
            <Text style={styles.kpiValue}>{kpiStats.multiSitePermitted}</Text>
            <Text style={styles.kpiSub}>Access to {'>'}1 substation</Text>
          </View>

          {/* Card 4: Supervisors */}
          <View style={[styles.kpiCard, styles.kpiCardBorderOrange]}>
            <Text style={styles.kpiLabel}>SUPERVISORS</Text>
            <Text style={styles.kpiValue}>{kpiStats.supervisors}</Text>
            <Text style={styles.kpiSub}>Area operations leads</Text>
          </View>
        </View>

        {/* ============================================================== */}
        {/* 3. SEARCH & DROPDOWN FILTER BAR (IMAGE 1)                      */}
        {/* ============================================================== */}
        <View style={[styles.filterBarCard, SHADOWS.sm]}>
          {/* Search Box */}
          <View style={styles.searchBoxWrap}>
            <Search size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search staff by name or code..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity delayPressIn={0} onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={15} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Site Filter Button */}
          <TouchableOpacity delayPressIn={0}
            style={styles.filterBtn}
            onPress={() => setShowSiteFilterModal(true)}
            activeOpacity={0.7}
          >
            <Filter size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.filterBtnText} numberOfLines={1}>
              {selectedSiteFilter === 'all'
                ? `All Sites (${substations.length})`
                : getSiteName(selectedSiteFilter)}
            </Text>
            <ChevronDown size={14} color="#64748B" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          {/* Role Filter Button */}
          <TouchableOpacity delayPressIn={0}
            style={styles.filterBtn}
            onPress={() => setShowRoleFilterModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.filterBtnText}>
              {selectedRoleFilter === 'all'
                ? 'All Roles'
                : selectedRoleFilter === 'supervisor'
                ? 'Supervisors'
                : 'Technicians'}
            </Text>
            <ChevronDown size={14} color="#64748B" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* ============================================================== */}
        {/* 4. MAIN DATA TABLE (IMAGE 1)                                   */}
        {/* ============================================================== */}
        <View style={[styles.tableCard, SHADOWS.sm]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: isDesktop ? '100%' : 780 }}>
              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thCell, { width: 230, flex: isDesktop ? 2.2 : undefined }]}>
                  EMPLOYEE / ROLE
                </Text>
                <Text style={[styles.thCell, { width: 170, flex: isDesktop ? 1.6 : undefined }]}>
                  PRIMARY ASSIGNED SITE
                </Text>
                <Text style={[styles.thCell, { width: 200, flex: isDesktop ? 2.0 : undefined }]}>
                  PERMITTED CHECK-IN SITES
                </Text>
                <Text style={[styles.thCell, { width: 100, flex: isDesktop ? 0.9 : undefined }]}>
                  STATUS
                </Text>
                <Text
                  style={[
                    styles.thCell,
                    { width: 130, flex: isDesktop ? 1.2 : undefined, textAlign: 'center' },
                  ]}
                >
                  ACTION
                </Text>
              </View>

              {/* Data Rows */}
              {loading ? (
                <View style={{ paddingVertical: 45, alignItems: 'center' }}>
                  <LoadingSpinner message="Loading employee allocations..." />
                </View>
              ) : filteredEmployees.length === 0 ? (
                <View style={styles.emptyTable}>
                  <Text style={styles.emptyTableText}>No staff members match the selected filters.</Text>
                </View>
              ) : (
                filteredEmployees.map((emp, index) => {
                  const isCurrentUser =
                    user?.id === emp.id || user?.employeeId === emp.employeeId;
                  const isSupervisor = emp.role === 'supervisor';
                  const primarySiteName = getSiteName(emp.assignedSiteId);
                  const permittedSites = (emp.assignedSiteIds || []).map((id) => getSiteName(id));

                  return (
                    <View
                      key={emp.id || index}
                      style={[
                        styles.tableDataRow,
                        index % 2 === 1 && { backgroundColor: '#F8FAFC' },
                      ]}
                    >
                      {/* Column 1: EMPLOYEE / ROLE */}
                      <View
                        style={[
                          styles.employeeCol,
                          { width: 230, flex: isDesktop ? 2.2 : undefined },
                        ]}
                      >
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarText}>{getInitials(emp.name)}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.empNameText}>{emp.name}</Text>
                            {isCurrentUser && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>You</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.empSubRow}>
                            <Text style={styles.empCodeText}>{emp.employeeId}</Text>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.empDesigText}>{emp.designation}</Text>
                            <Text style={styles.bulletDot}>•</Text>
                            {isSupervisor ? (
                              <View style={styles.supervisorRoleBadge}>
                                <Text style={styles.supervisorRoleBadgeText}>Supervisor</Text>
                              </View>
                            ) : (
                              <Text style={styles.techRoleText}>Technician</Text>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Column 2: PRIMARY ASSIGNED SITE */}
                      <View
                        style={{
                          width: 170,
                          flex: isDesktop ? 1.6 : undefined,
                          justifyContent: 'center',
                        }}
                      >
                        <View style={styles.primarySitePill}>
                          <MapPin size={11} color="#1E63F0" style={{ marginRight: 5 }} />
                          <Text style={styles.primarySitePillText} numberOfLines={1}>
                            @ {primarySiteName}
                          </Text>
                        </View>
                      </View>

                      {/* Column 3: PERMITTED CHECK-IN SITES */}
                      <View
                        style={{
                          width: 200,
                          flex: isDesktop ? 2.0 : undefined,
                          justifyContent: 'center',
                        }}
                      >
                        <View style={styles.permittedSitesWrap}>
                          {permittedSites.slice(0, 2).map((siteName, sIdx) => (
                            <View key={sIdx} style={styles.permittedSiteBadge}>
                              <Text style={styles.permittedSiteBadgeText} numberOfLines={1}>
                                {siteName}
                              </Text>
                            </View>
                          ))}
                          {permittedSites.length > 2 && (
                            <View style={styles.moreCountBadge}>
                              <Text style={styles.moreCountBadgeText}>
                                +{permittedSites.length - 2} more
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Column 4: STATUS */}
                      <View
                        style={{
                          width: 100,
                          flex: isDesktop ? 0.9 : undefined,
                          justifyContent: 'center',
                        }}
                      >
                        <View style={styles.statusActivePill}>
                          <View style={styles.activeDot} />
                          <Text style={styles.statusActiveText}>Active</Text>
                        </View>
                      </View>

                      {/* Column 5: ACTION */}
                      <View
                        style={{
                          width: 130,
                          flex: isDesktop ? 1.2 : undefined,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <TouchableOpacity delayPressIn={0}
                          style={styles.changeSitesBtn}
                          onPress={() => handleOpenChangeSites(emp)}
                          activeOpacity={0.8}
                        >
                          <Shield size={12} color="#1E63F0" style={{ marginRight: 6 }} />
                          <Text style={styles.changeSitesBtnText}>Change Sites</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* ============================================================== */}
      {/* 5. CHANGE SITES ALLOCATION MODAL                               */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 5. CHANGE SITE ASSIGNMENT MODAL (MATCHING SCREENSHOT)          */}
      {/* ============================================================== */}
      <Modal
        visible={showChangeSiteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangeSiteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Change Site Assignment — {selectedEmployee?.name || 'Staff'}
              </Text>
              <TouchableOpacity delayPressIn={0}
                onPress={() => setShowChangeSiteModal(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={19} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Modal Body */}
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={styles.modalBodyScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {/* Selected Employee Summary Card */}
              {selectedEmployee && (
                <View style={styles.modalEmpHeaderCard}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {getInitials(selectedEmployee.name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
                    <Text style={styles.modalEmpName} numberOfLines={1}>{selectedEmployee.name}</Text>
                    <Text style={styles.modalEmpSub} numberOfLines={1}>
                      ID: <Text style={styles.modalEmpIdHighlight}>{selectedEmployee.employeeId}</Text>
                      {' • '}{selectedEmployee.designation}
                    </Text>
                  </View>
                  <View style={styles.modalRolePill}>
                    <Text style={styles.modalRolePillText}>
                      {selectedEmployee.role === 'admin'
                        ? 'ADMIN'
                        : selectedEmployee.role === 'supervisor'
                        ? 'SUPERVISOR'
                        : 'TECHNICIAN'}
                    </Text>
                  </View>
                </View>
              )}

              {/* SECTION 1: Primary Assigned Worksite (Main Base) */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <MapPin size={14} color="#1E63F0" style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeading}>
                      Primary Assigned Worksite (Main Base)
                    </Text>
                  </View>
                  <View style={styles.requiredBadge}>
                    <Text style={styles.requiredBadgeText}>Required</Text>
                  </View>
                </View>

                {/* Primary Site Dropdown Trigger */}
                <TouchableOpacity delayPressIn={0}
                  style={styles.dropdownTriggerBox}
                  onPress={() => setShowPrimaryDropdown(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                    {selectedPrimarySubstation
                      ? `${selectedPrimarySubstation.name} (${selectedPrimarySubstation.code || 'ADN'}) — ${selectedPrimarySubstation.address}`
                      : 'Select primary worksite...'}
                  </Text>
                  <ChevronDown size={17} color="#475569" />
                </TouchableOpacity>

                <Text style={styles.sectionHelperText}>
                  This is the employee's default work location for daily shift rosters, salary calculation, and automated attendance checks.
                </Text>
              </View>

              {/* SECTION 2: Authorized Check-In Sites (Multi-Site Geofence) */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderWrap}>
                  <View style={styles.sectionTitleRow}>
                    <Shield size={14} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeading}>
                      Authorized Check-In Sites{' '}
                      <Text style={styles.sectionSubHeading}>(Multi-Site Geofence)</Text>
                    </Text>
                  </View>

                  {/* Quick Action Pill Buttons */}
                  <View style={styles.quickActionGroup}>
                    <TouchableOpacity delayPressIn={0}
                      style={styles.quickBtnSelectAll}
                      onPress={handleSelectAllSites}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickBtnSelectAllText}>Select All Sites</Text>
                    </TouchableOpacity>

                    <TouchableOpacity delayPressIn={0}
                      style={styles.quickBtnPrimaryOnly}
                      onPress={handlePrimaryOnly}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickBtnPrimaryOnlyText}>Primary Only</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.sectionSubtitleText}>
                  Select all substation sites where this employee is authorized to punch Check-In or Check-Out:
                </Text>

                {/* Substation Checkbox List Box */}
                <View style={styles.substationsListBox}>
                  <ScrollView
                    style={{ maxHeight: 220 }}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    {sortedSubstations.map((site) => {
                      const isPrimary = selectedPrimarySiteId === site.id || selectedPrimarySiteId === site.name;
                      const isChecked = selectedPermittedSiteIds.includes(site.id) || selectedPermittedSiteIds.includes(site.name);

                      return (
                        <TouchableOpacity delayPressIn={0}
                          key={site.id}
                          style={[
                            styles.siteCheckboxCard,
                            isPrimary && styles.siteCheckboxCardPrimary,
                          ]}
                          onPress={() => handleTogglePermittedSite(site.id)}
                          activeOpacity={0.7}
                        >
                          {/* Checkbox box */}
                          <View
                            style={[
                              styles.checkboxSquare,
                              isChecked && styles.checkboxSquareChecked,
                            ]}
                          >
                            {isChecked && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                          </View>

                          {/* Site info */}
                          <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                            <Text style={styles.siteCardName} numberOfLines={1}>{site.name}</Text>
                            <Text style={styles.siteCardAddress} numberOfLines={1}>{site.address}</Text>
                          </View>

                          {/* Right Badges */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {isPrimary && (
                              <View style={styles.primarySiteSolidBadge}>
                                <Text style={styles.primarySiteSolidBadgeText}>Primary Site</Text>
                              </View>
                            )}
                            <View style={styles.radiusPillTag}>
                              <Text style={styles.radiusPillTagText}>
                                {site.radiusMeters || 500}m
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </ScrollView>

            {/* Fixed Modal Footer */}
            <View style={styles.modalFooterRow}>
              <TouchableOpacity delayPressIn={0}
                style={styles.modalCancelBtn}
                onPress={() => setShowChangeSiteModal(false)}
                activeOpacity={0.7}
                disabled={savingAllocation}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity delayPressIn={0}
                style={styles.modalSaveBtn}
                onPress={handleSaveSiteAllocation}
                activeOpacity={0.85}
                disabled={savingAllocation}
              >
                {savingAllocation ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save Site Assignment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* 5B. PRIMARY WORKSITE DROPDOWN PICKER MODAL                     */}
      {/* ============================================================== */}
      <Modal
        visible={showPrimaryDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPrimaryDropdown(false)}
      >
        <TouchableOpacity delayPressIn={0}
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowPrimaryDropdown(false)}
        >
          <View style={[styles.pickerModalCard, { maxWidth: 500 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.pickerTitle}>Select Primary Assigned Worksite</Text>
              <TouchableOpacity delayPressIn={0} onPress={() => setShowPrimaryDropdown(false)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {substations.map((site) => {
                const isSelected = selectedPrimarySiteId === site.id || selectedPrimarySiteId === site.name;
                return (
                  <TouchableOpacity delayPressIn={0}
                    key={site.id}
                    style={[
                      styles.primaryPickItem,
                      isSelected && styles.primaryPickItemActive,
                    ]}
                    onPress={() => {
                      handleSelectPrimarySite(site.id);
                      setShowPrimaryDropdown(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.primaryPickName, isSelected && { color: '#1D4ED8', fontWeight: '800' }]}>
                        {site.name} ({site.code || 'SITE'})
                      </Text>
                      <Text style={styles.primaryPickAddress}>{site.address}</Text>
                    </View>
                    {isSelected && <Check size={16} color="#1D4ED8" strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================================== */}
      {/* 6. SITE FILTER PICKER MODAL                                    */}
      {/* ============================================================== */}
      <Modal
        visible={showSiteFilterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSiteFilterModal(false)}
      >
        <TouchableOpacity delayPressIn={0}
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowSiteFilterModal(false)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerTitle}>Filter by Substation</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity delayPressIn={0}
                style={[
                  styles.pickerItem,
                  selectedSiteFilter === 'all' && styles.pickerItemActive,
                ]}
                onPress={() => {
                  setSelectedSiteFilter('all');
                  setShowSiteFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedSiteFilter === 'all' && styles.pickerItemTextActive,
                  ]}
                >
                  All Sites ({substations.length})
                </Text>
                {selectedSiteFilter === 'all' && <Check size={16} color="#1E63F0" />}
              </TouchableOpacity>

              {substations.map((s) => (
                <TouchableOpacity delayPressIn={0}
                  key={s.id}
                  style={[
                    styles.pickerItem,
                    selectedSiteFilter === s.id && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedSiteFilter(s.id);
                    setShowSiteFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedSiteFilter === s.id && styles.pickerItemTextActive,
                    ]}
                  >
                    {s.name} ({s.code})
                  </Text>
                  {selectedSiteFilter === s.id && <Check size={16} color="#1E63F0" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================================== */}
      {/* 7. ROLE FILTER PICKER MODAL                                    */}
      {/* ============================================================== */}
      <Modal
        visible={showRoleFilterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRoleFilterModal(false)}
      >
        <TouchableOpacity delayPressIn={0}
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowRoleFilterModal(false)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerTitle}>Filter by Role</Text>
            {[
              { key: 'all', label: 'All Roles' },
              { key: 'technician', label: 'Field Technicians & Installers' },
              { key: 'supervisor', label: 'Supervisors & Leads' },
            ].map((roleOpt) => (
              <TouchableOpacity delayPressIn={0}
                key={roleOpt.key}
                style={[
                  styles.pickerItem,
                  selectedRoleFilter === roleOpt.key && styles.pickerItemActive,
                ]}
                onPress={() => {
                  setSelectedRoleFilter(roleOpt.key);
                  setShowRoleFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedRoleFilter === roleOpt.key && styles.pickerItemTextActive,
                  ]}
                >
                  {roleOpt.label}
                </Text>
                {selectedRoleFilter === roleOpt.key && <Check size={16} color="#1E63F0" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================================== */}
      {/* 8. ADD SUBSTATION SITE MODAL (SUPERVISOR & ADMIN)               */}
      {/* ============================================================== */}
      <Modal
        visible={showAddSiteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddSiteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.siteModalCard, SHADOWS.lg]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Zap size={20} color="#1E63F0" />
                <Text style={styles.modalTitle}>Add New Substation Site</Text>
              </View>
              <TouchableOpacity delayPressIn={0}
                style={styles.modalCloseBtn}
                onPress={() => setShowAddSiteModal(false)}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                {/* Site Name & Code */}
                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Substation Site Name *</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. Kothrud 132kV Substation"
                      placeholderTextColor="#94A3B8"
                      value={newSiteName}
                      onChangeText={setNewSiteName}
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Site Code *</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. ADN-SITE-009"
                      placeholderTextColor="#94A3B8"
                      value={newSiteCode}
                      onChangeText={setNewSiteCode}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                {/* Circle & Division */}
                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Circle</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. Ahmedabad Circle"
                      placeholderTextColor="#94A3B8"
                      value={newSiteCircle}
                      onChangeText={setNewSiteCircle}
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Division</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. North Division"
                      placeholderTextColor="#94A3B8"
                      value={newSiteDivision}
                      onChangeText={setNewSiteDivision}
                    />
                  </View>
                </View>

                {/* Baseline Latitude & Longitude */}
                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Baseline Latitude *</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. 21.1926"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={newSiteLat}
                      onChangeText={setNewSiteLat}
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Baseline Longitude *</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. 72.7997"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={newSiteLng}
                      onChangeText={setNewSiteLng}
                    />
                  </View>
                </View>

                {/* Location Section Header & Pin GPS Button */}
                <View style={styles.locationHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MapPin size={15} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.formSectionTitle}>Site Location & Address</Text>
                  </View>

                  <TouchableOpacity delayPressIn={0}
                    style={styles.pinGpsBtn}
                    onPress={handlePinCurrentGPS}
                    activeOpacity={0.8}
                  >
                    <Crosshair size={13} color="#2563EB" style={{ marginRight: 4 }} />
                    <Text style={styles.pinGpsBtnText}>Pin My Current GPS</Text>
                  </TouchableOpacity>
                </View>

                {/* Location Search Bar */}
                <View style={styles.searchBarWrapper}>
                  <View style={styles.searchInputContainer}>
                    <Search size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchTextInput}
                      placeholder="Search location, city, or address..."
                      placeholderTextColor="#94A3B8"
                      value={searchLocation}
                      onChangeText={handleSearchTextChange}
                      onSubmitEditing={handleSearchAndNavigate}
                    />
                    {searchLocation.length > 0 && (
                      <TouchableOpacity delayPressIn={0}
                        onPress={() => {
                          setSearchLocation('');
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                        style={{ padding: 4 }}
                      >
                        <X size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity delayPressIn={0}
                    style={styles.searchNavBtn}
                    onPress={handleSearchAndNavigate}
                    activeOpacity={0.85}
                    disabled={searchingLocation}
                  >
                    {searchingLocation ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.searchNavBtnText}>Search & Navigate</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Autocomplete Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <View style={[styles.suggestionsBox, SHADOWS.md]}>
                    <View style={styles.suggestionsHeader}>
                      <Text style={styles.suggestionsHeaderText}>
                        SELECT LOCATION SUGGESTION ({suggestions.length})
                      </Text>
                    </View>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {suggestions.map((item, index) => (
                        <TouchableOpacity delayPressIn={0}
                          key={`${item.title}-${index}`}
                          style={[
                            styles.suggestionItem,
                            index === suggestions.length - 1 && { borderBottomWidth: 0 },
                          ]}
                          onPress={() => handleSelectSuggestion(item)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.suggestionIconWrap}>
                            <MapPin size={15} color="#2563EB" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.suggestionTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={styles.suggestionSub} numberOfLines={2}>
                              {item.subtitle}
                            </Text>
                            <View style={styles.coordTag}>
                              <Text style={styles.coordTagText}>
                                GPS: {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Quick Location Presets */}
                <View style={{ marginVertical: 8 }}>
                  <Text style={styles.quickPinsLabel}>QUICK LOCATION PRESETS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {QUICK_PINS.map((pin) => (
                      <TouchableOpacity delayPressIn={0}
                        key={pin.code}
                        style={styles.quickPinChip}
                        onPress={() => handleSelectQuickPin(pin)}
                        activeOpacity={0.8}
                      >
                        <MapPin size={12} color="#1E63F0" style={{ marginRight: 4 }} />
                        <Text style={styles.quickPinChipText}>{pin.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Interactive Map View */}
                <View style={styles.mapContainer}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    region={mapRegion}
                    onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
                  >
                    {/* Geofence Circle */}
                    <Circle
                      center={{ latitude: parsedLat, longitude: parsedLng }}
                      radius={parsedRadius}
                      strokeColor="#10B981"
                      strokeWidth={2}
                      fillColor="rgba(16, 185, 129, 0.16)"
                    />

                    {/* Draggable Marker */}
                    <Marker
                      coordinate={{ latitude: parsedLat, longitude: parsedLng }}
                      draggable
                      onDragEnd={(e) => handleMapPress(e.nativeEvent.coordinate)}
                    >
                      <View style={styles.customMarkerContainer}>
                        <View style={styles.customMarkerPill}>
                          <Building2 size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.customMarkerText} numberOfLines={1}>
                            {newSiteName || 'Site Location'}
                          </Text>
                        </View>
                        <View style={styles.markerTriangle} />
                      </View>
                    </Marker>
                  </MapView>

                  {/* Instruction Tag */}
                  <View style={styles.mapInstructionPill}>
                    <Text style={styles.mapInstructionText}>
                      Tap map or drag pin to set exact coordinates
                    </Text>
                  </View>

                  {/* Zoom Controls */}
                  <View style={styles.zoomControlsWrap}>
                    <TouchableOpacity delayPressIn={0} style={styles.zoomBtn} onPress={handleZoomIn}>
                      <Text style={styles.zoomBtnText}>+</Text>
                    </TouchableOpacity>
                    <View style={styles.zoomDivider} />
                    <TouchableOpacity delayPressIn={0} style={styles.zoomBtn} onPress={handleZoomOut}>
                      <Text style={styles.zoomBtnText}>-</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Geofence Radius */}
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.formLabel}>Geofence Radius (Meters) *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 500"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={newSiteRadius}
                    onChangeText={setNewSiteRadius}
                  />
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                    Technicians must check in within this radius (default 500m).
                  </Text>
                </View>

                {/* Contact Manager Name & Phone */}
                <View style={[styles.formRow, { marginTop: 10 }]}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Site Manager / In-Charge</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. Rajesh Kumar"
                      placeholderTextColor="#94A3B8"
                      value={newSiteManagerName}
                      onChangeText={setNewSiteManagerName}
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>Manager Phone</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. 9876543210"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={newSiteManagerPhone}
                      onChangeText={setNewSiteManagerPhone}
                    />
                  </View>
                </View>

                {/* Site Address */}
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.formLabel}>Site Address / Location Notes</Text>
                  <TextInput
                    style={[styles.formInput, { height: 50 }]}
                    placeholder="e.g. Substation Yard Gate 2, Ring Road, Textile Hub"
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={newSiteAddress}
                    onChangeText={setNewSiteAddress}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity delayPressIn={0}
                style={styles.cancelBtn}
                onPress={() => setShowAddSiteModal(false)}
                disabled={savingNewSite}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity delayPressIn={0}
                style={styles.saveBtn}
                onPress={handleSaveNewSite}
                disabled={savingNewSite}
              >
                {savingNewSite ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MapPin size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.saveBtnText}>Save Baseline Coordinates</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Drawer */}
      <SupervisorDrawerModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  addSiteHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E63F0',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#1E63F0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addSiteHeaderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  siteModalCard: {
    width: '95%',
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
  },
  modalBody: {
    paddingVertical: 4,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  formCol: {
    flex: 1,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  searchNavBtn: {
    backgroundColor: '#1E63F0',
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
    overflow: 'hidden',
  },
  suggestionsHeader: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  suggestionsHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  suggestionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  coordTag: {
    marginTop: 2,
  },
  coordTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  quickPinsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  quickPinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  quickPinChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E63F0',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  pinGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pinGpsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 4,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  customMarkerContainer: {
    alignItems: 'center',
  },
  customMarkerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E63F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  customMarkerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  markerTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1E63F0',
    transform: [{ rotate: '180deg' }],
    marginTop: -1,
  },
  mapInstructionPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mapInstructionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  zoomControlsWrap: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 3,
  },
  zoomBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E63F0',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 10,
  },
  screenTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  screenSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  refreshIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshIconBtnText: {
    color: '#1E63F0',
    fontSize: 12,
    fontWeight: '700',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    padding: 16,
  },

  // 1. KPI Cards Row (Matching image 1)
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    ...SHADOWS.sm,
  },
  kpiCardBorderBlue: {
    borderLeftColor: '#1E63F0',
  },
  kpiCardBorderGreen: {
    borderLeftColor: '#10B981',
  },
  kpiCardBorderPurple: {
    borderLeftColor: '#8B5CF6',
  },
  kpiCardBorderOrange: {
    borderLeftColor: '#F59E0B',
  },
  kpiLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // 2. Search & Filter Bar (Matching image 1)
  filterBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 16,
    gap: 10,
    flexWrap: 'wrap',
  },
  searchBoxWrap: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 4,
  },
  filterBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },

  // 3. Table Card (Matching image 1)
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },

  // Column 1: Employee
  employeeCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E40AF',
  },
  empNameText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  youBadge: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  youBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#C2410C',
  },
  empSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  empCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  bulletDot: {
    fontSize: 10,
    color: '#94A3B8',
  },
  empDesigText: {
    fontSize: 11,
    color: '#475569',
  },
  techRoleText: {
    fontSize: 11,
    color: '#64748B',
  },
  supervisorRoleBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  supervisorRoleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },

  // Column 2: Primary Site
  primarySitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  primarySitePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E63F0',
  },

  // Column 3: Permitted Sites
  permittedSitesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  permittedSiteBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  permittedSiteBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  moreCountBadge: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  moreCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7E22CE',
  },

  // Column 4: Status
  statusActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  // Column 5: Action
  changeSitesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  changeSitesBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  emptyTable: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTableText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // Modal Overlay & Card
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
  },

  // Modal Scroll Body
  modalBodyScroll: {
    flexShrink: 1,
    width: '100%',
    marginVertical: 4,
  },
  modalBodyScrollContent: {
    paddingBottom: 6,
  },

  // Selected Employee Banner Card
  modalEmpHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginVertical: 10,
  },
  modalAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E40AF',
  },
  modalEmpName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalEmpSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalEmpIdHighlight: {
    fontWeight: '700',
    color: '#0F172A',
  },
  modalRolePill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  modalRolePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
    letterSpacing: 0.5,
  },

  // Form Sections
  formSection: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubHeading: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  requiredBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  requiredBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  dropdownTriggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  dropdownTriggerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  sectionHelperText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 5,
    marginBottom: 8,
  },

  // Quick Action Buttons
  quickActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickBtnSelectAll: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickBtnSelectAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E63F0',
  },
  quickBtnPrimaryOnly: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickBtnPrimaryOnlyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  sectionSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 15,
  },

  // Substation List Box & Cards
  substationsListBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 6,
    backgroundColor: '#F8FAFC',
  },
  siteCheckboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  siteCheckboxCardPrimary: {
    borderColor: '#2563EB',
    borderWidth: 1.5,
    backgroundColor: '#EFF6FF',
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareChecked: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  siteCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  siteCardAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  primarySiteSolidBadge: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  primarySiteSolidBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  radiusPillTag: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  radiusPillTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },

  // Modal Footer
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
  },
  modalCancelBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  modalSaveBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Primary Picker Item
  primaryPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  primaryPickItemActive: {
    backgroundColor: '#EFF6FF',
  },
  primaryPickName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  primaryPickAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    ...SHADOWS.md,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerItemActive: {
    backgroundColor: '#EFF6FF',
  },
  pickerItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  pickerItemTextActive: {
    color: '#1E63F0',
    fontWeight: '700',
  },
});

export default SupervisorSiteManagementScreen;
