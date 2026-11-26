import { apiClient, setStoredToken, clearStoredToken } from './api';
import { User } from '../types';
import { firestoreDb, ADMIN_USERS } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export interface LoginResult {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  email?: string;
  targetEmail?: string;
  employeeId?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  employeeId?: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
  employeeId?: string;
}

export const authService = {
  async login(username: string, password: string, rememberMe: boolean = true): Promise<LoginResult> {
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    try {
      const response = await apiClient.post<LoginResult>('/auth/login', {
        username: trimmedUser,
        password: trimmedPass,
      });
      if (response.data?.access_token) {
        if (rememberMe) {
          await setStoredToken(response.data.access_token);
        } else {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
          await clearStoredToken();
        }
        return response.data;
      }
    } catch (apiErr) {
      console.warn('Backend API login error, attempting Firestore database auth...', apiErr);
    }

    // Direct Firestore Database Authentication Fallback
    try {
      const cleanUser = trimmedUser.toLowerCase().replace(/[\/\-_]/g, '');

      const isMatch = (data: any, docId: string) => {
        const empId = (data.employeeId || '').toLowerCase().replace(/[\/\-_]/g, '');
        const docIdClean = (docId || '').toLowerCase().replace(/[\/\-_]/g, '');
        const username = (data.username || '').toLowerCase().replace(/[\/\-_]/g, '');
        const phone = (data.phone || '').trim();
        const email = (data.email || '').toLowerCase().trim();

        const identifierMatch =
          empId === cleanUser ||
          docIdClean === cleanUser ||
          username === cleanUser ||
          phone === trimmedUser ||
          email === trimmedUser.toLowerCase() ||
          (data.employeeCode && (data.employeeCode || '').toLowerCase().replace(/[\/\-_]/g, '') === cleanUser);

        if (!identifierMatch) return false;

        const docPass = data.password ? String(data.password).trim() : '';
        if (docPass) {
          return docPass === trimmedPass;
        }
        return true;
      };

      // 1. Check seed match first
      const seedMatch = ADMIN_USERS.find((a) => isMatch(a, a.employeeId));
      let foundUser: any = seedMatch || null;

      if (!foundUser) {
        // 2. Search 'users' collection
        const usersSnap = await getDocs(collection(firestoreDb, 'users'));
        for (const docSnap of usersSnap.docs) {
          if (isMatch(docSnap.data(), docSnap.id)) {
            foundUser = { id: docSnap.id, ...docSnap.data() };
            break;
          }
        }
      }

      if (!foundUser) {
        // 3. Search 'employees' collection
        const empsSnap = await getDocs(collection(firestoreDb, 'employees'));
        for (const docSnap of empsSnap.docs) {
          if (isMatch(docSnap.data(), docSnap.id)) {
            foundUser = { id: docSnap.id, ...docSnap.data() };
            break;
          }
        }
      }

      if (foundUser) {
        const fakeToken = `firestore_token_${Date.now()}`;
        if (rememberMe) {
          await setStoredToken(fakeToken);
        } else {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${fakeToken}`;
          await clearStoredToken();
        }

        const userObj: User = {
          id: foundUser.id || foundUser.employeeId,
          employeeId: foundUser.employeeId || trimmedUser,
          name: foundUser.name || 'Operations Admin',
          role: (foundUser.role || 'admin') as any,
          designation: foundUser.designation || 'Operations Administrator',
          phone: foundUser.phone || '9876543210',
          email: foundUser.email || `${trimmedUser.replace(/\//g, '_')}@adani.com`,
          department: foundUser.department || 'Central Command',
          status: 'active',
        };

        return {
          access_token: fakeToken,
          token_type: 'bearer',
          user: userObj,
        };
      }
    } catch (fsErr) {
      console.warn('Firestore database auth error:', fsErr);
    }

    throw new Error('Invalid credentials. Please verify Employee ID and password.');
  },

  async getProfile(): Promise<User> {
    try {
      const response = await apiClient.get<User>('/auth/me');
      return response.data;
    } catch {
      // Return cached user if session is running on Firestore token
      const { useAuthStore } = require('../store/useAuthStore');
      const currentUser = useAuthStore.getState().user;
      if (currentUser) return currentUser;
      throw new Error('Session expired');
    }
  },

  async forgotPassword(identifier: string, email?: string): Promise<ForgotPasswordResponse> {
    const response = await apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', {
      identifier: identifier.trim(),
      employeeId: identifier.trim(),
      email: email ? email.trim() : undefined,
    });
    return response.data;
  },

  async verifyOtp(identifier: string, otp: string): Promise<VerifyOtpResponse> {
    const response = await apiClient.post<VerifyOtpResponse>('/auth/verify-otp', {
      identifier: identifier.trim(),
      employeeId: identifier.trim(),
      otp: otp.trim(),
    });
    return response.data;
  },

  async resetPassword(identifier: string, otp: string, newPassword: string): Promise<ResetPasswordResponse> {
    const response = await apiClient.post<ResetPasswordResponse>('/auth/reset-password', {
      identifier: identifier.trim(),
      employeeId: identifier.trim(),
      otp: otp.trim(),
      newPassword,
    });
    return response.data;
  },

  async logout(): Promise<void> {
    await clearStoredToken();
  },
};
