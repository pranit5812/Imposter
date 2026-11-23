import { Platform } from 'react-native';
import { Paths, File as ExpoFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient, getStoredToken } from './api';
import { User } from '../types';
import { firestoreDb } from '../config/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { sanitizePhoneNumber } from '../utils/phoneUtils';

export interface EmployeeFilters {
  search?: string;
  role?: string;
  status?: string;
}

export interface BulkUploadResponse {
  success: boolean;
  totalRows: number;
  addedCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
  message: string;
  employees: Array<{
    id: string;
    employeeId: string;
    name: string;
    phone: string;
    role: string;
    status: string;
  }>;
}

export interface BulkEmployeeItem {
  employeeId: string;
  phone: string;
  password: string;
  name?: string;
  role?: string;
  designation?: string;
  assignedSiteIds?: string[];
  assignedSiteId?: string;
  email?: string;
  circle?: string;
  division?: string;
  department?: string;
}

let cachedEmployeesList: User[] = [];

export const employeeService = {
  getCachedEmployees(): User[] {
    return cachedEmployeesList;
  },

  async getEmployees(filters?: EmployeeFilters): Promise<User[]> {
    try {
      const response = await apiClient.get<User[]>('/employees', { params: filters });
      if (response.data && Array.isArray(response.data)) {
        const cleaned = response.data.map((emp) => ({
          ...emp,
          phone: sanitizePhoneNumber(emp.phone),
        })).sort((a, b) => {
          return (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true, sensitivity: 'base' });
        });
        if (!filters || (!filters.role && !filters.search && !filters.status)) {
          cachedEmployeesList = cleaned;
        } else if (cachedEmployeesList.length === 0) {
          cachedEmployeesList = cleaned;
        }
        return cleaned;
      }
      return response.data || [];
    } catch (err) {
      if (cachedEmployeesList.length > 0) {
        console.warn('Network error fetching employees, serving cached list of', cachedEmployeesList.length);
        let list = [...cachedEmployeesList];
        if (filters?.role) {
          list = list.filter((e) => (e.role || '').toLowerCase() === filters.role?.toLowerCase());
        }
        if (filters?.status) {
          list = list.filter((e) => (e.status || '').toLowerCase() === filters.status?.toLowerCase());
        }
        if (filters?.search) {
          const s = filters.search.toLowerCase();
          list = list.filter(
            (e) =>
              (e.name || '').toLowerCase().includes(s) ||
              (e.employeeId || '').toLowerCase().includes(s) ||
              (e.phone || '').includes(s)
          );
        }
        return list;
      }
      throw err;
    }
  },

  async getEmployeeById(employeeId: string): Promise<User> {
    const response = await apiClient.get<User>(`/employees/${encodeURIComponent(employeeId)}`);
    if (response.data && response.data.phone) {
      response.data.phone = sanitizePhoneNumber(response.data.phone);
    }
    return response.data;
  },

  async createEmployee(data: Partial<User> & { password: string }): Promise<User> {
    const payload = {
      ...data,
      phone: sanitizePhoneNumber(data.phone),
    };
    let createdUser: User;
    try {
      const response = await apiClient.post<User>('/employees', payload);
      createdUser = response.data;
    } catch {
      // Fallback: Create directly in Firestore if backend API is offline
      const cleanId = (data.employeeId || `emp_${Date.now()}`).replace(/\//g, '_');
      createdUser = {
        id: cleanId,
        employeeId: data.employeeId || cleanId,
        name: data.name || 'New Employee',
        role: data.role || 'technician',
        designation: data.designation || 'Smart Meter Technician',
        phone: sanitizePhoneNumber(data.phone),
        email: data.email || '',
        department: data.department || 'Operations',
        status: 'active',
      };
    }

    // Always sync newly created employee to Firestore
    try {
      const fsId = String(createdUser.id || createdUser.employeeId).replace(/\//g, '_');
      await setDoc(doc(firestoreDb, 'employees', fsId), { ...createdUser, password: data.password }, { merge: true });
      await setDoc(doc(firestoreDb, 'users', fsId), { ...createdUser, password: data.password }, { merge: true });
    } catch (fsErr) {
      console.warn('Firestore employee sync error:', fsErr);
    }

    cachedEmployeesList = [createdUser, ...cachedEmployeesList];
    return createdUser;
  },

  async updateEmployee(employeeId: string, data: Partial<User>): Promise<User> {
    const payload = {
      ...data,
      phone: data.phone ? sanitizePhoneNumber(data.phone) : undefined,
    };
    const response = await apiClient.put<User>(`/employees/${encodeURIComponent(employeeId)}`, payload);
    if (response.data) {
      if (response.data.phone) response.data.phone = sanitizePhoneNumber(response.data.phone);
      cachedEmployeesList = cachedEmployeesList.map((e) =>
        e.id === response.data.id || e.employeeId === response.data.employeeId ? response.data : e
      );
    }
    return response.data;
  },

  async deleteEmployee(employeeId: string): Promise<void> {
    // 1. Delete from Firestore database
    try {
      const cleanFsId = String(employeeId).replace(/\//g, '_');
      await deleteDoc(doc(firestoreDb, 'employees', cleanFsId)).catch(() => {});
      await deleteDoc(doc(firestoreDb, 'users', cleanFsId)).catch(() => {});
      await deleteDoc(doc(firestoreDb, 'employees', employeeId)).catch(() => {});
      await deleteDoc(doc(firestoreDb, 'users', employeeId)).catch(() => {});
    } catch (fsErr) {
      console.warn('Firestore delete notice:', fsErr);
    }

    // 2. Delete from Backend API
    try {
      await apiClient.delete(`/employees/${encodeURIComponent(employeeId)}`);
    } catch (e1) {
      try {
        await apiClient.delete(`/employees/id/${encodeURIComponent(employeeId)}`);
      } catch (_) {}
    }

    const cleanId = String(employeeId).toLowerCase();
    cachedEmployeesList = cachedEmployeesList.filter(
      (e) =>
        String(e.id || '').toLowerCase() !== cleanId &&
        String((e as any)._id || '').toLowerCase() !== cleanId &&
        String(e.employeeId || '').toLowerCase() !== cleanId
    );
  },

  async resetPassword(employeeId: string): Promise<{ message: string }> {
    const response = await apiClient.post(`/employees/${encodeURIComponent(employeeId)}/reset-password`);
    return response.data;
  },

  /**
   * Bulk upload employees from an Excel (.xlsx, .xls) or CSV file.
   */
  async bulkUploadEmployees(
    file: { uri: string; name: string; type?: string; rawFile?: any },
    defaultSiteId?: string
  ): Promise<BulkUploadResponse> {
    const formData = new FormData();

    if (Platform.OS === 'web' && file.rawFile) {
      formData.append('file', file.rawFile);
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'Adani_Employees.xlsx',
        type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as any);
    }

    if (defaultSiteId) {
      formData.append('defaultSiteId', defaultSiteId);
    }

    const response = await apiClient.post<BulkUploadResponse>('/employees/bulk-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
      transformRequest: (data) => data, // Preserve native FormData on web & native
    });

    if (response.data && Array.isArray(response.data.employees)) {
      response.data.employees = response.data.employees.map((e) => ({
        ...e,
        phone: sanitizePhoneNumber(e.phone),
      }));
    }

    return response.data;
  },

  /**
   * Bulk import employee items directly via JSON payload.
   */
  async bulkImportJson(
    items: BulkEmployeeItem[],
    defaultSiteId?: string
  ): Promise<BulkUploadResponse> {
    const sanitizedItems = items.map((item) => ({
      ...item,
      phone: sanitizePhoneNumber(item.phone),
    }));
    const response = await apiClient.post<BulkUploadResponse>('/employees/bulk-import-json', sanitizedItems, {
      params: defaultSiteId ? { defaultSiteId } : undefined,
      timeout: 60000,
    });

    if (response.data && Array.isArray(response.data.employees)) {
      response.data.employees = response.data.employees.map((e) => ({
        ...e,
        phone: sanitizePhoneNumber(e.phone),
      }));
    }

    return response.data;
  },

  /**
   * Download the standard Adani bulk employees Excel template (.xlsx).
   */
  async downloadTemplate(): Promise<void> {
    const filename = 'Adani_Bulk_Employees_Template.xlsx';
    const token = await getStoredToken();

    if (Platform.OS === 'web') {
      try {
        const response = await apiClient.get('/employees/bulk-template', {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        return;
      } catch (err) {
        let fallbackUrl = `${apiClient.defaults.baseURL}/employees/bulk-template`;
        if (token) fallbackUrl += `?token=${encodeURIComponent(token)}`;
        window.open(fallbackUrl, '_blank');
        return;
      }
    }

    // Native Mobile (iOS/Android)
    try {
      const downloadUrl = `${apiClient.defaults.baseURL}/employees/bulk-template`;
      const destination = new ExpoFile(Paths.document, filename);

      const downloadedFile = await ExpoFile.downloadFileAsync(downloadUrl, destination, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadedFile.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Adani Bulk Employees Excel Template',
          UTI: 'com.microsoft.excel.xlsx',
        });
      }
      } catch (error: any) {
      console.error('Failed to download employee template:', error);
      throw error;
    }
  },
};
