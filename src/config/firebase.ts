import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyD3PFo-2s8hw2A5KgK7herT9cU0WqmWGjg",
  authDomain: "adani-energy-2f5e0.firebaseapp.com",
  projectId: "adani-energy-2f5e0",
  storageBucket: "adani-energy-2f5e0.firebasestorage.app",
  messagingSenderId: "381966539358",
  appId: "1:381966539358:web:1d6b976a8f5f7598d3b2cf",
  measurementId: "G-5F4Y1JX3EB"
};

// Initialize Firebase app singleton
export const firebaseApp: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Cloud Firestore database instance
export const firestoreDb: Firestore = getFirestore(firebaseApp);

export const ADMIN_USERS = [
  {
    id: 'b4s_Admin01',
    employeeId: 'b4s/Admin01',
    username: 'b4s/Admin01',
    password: 'Admin@01',
    name: 'Senior Operations Admin 01',
    role: 'admin',
    designation: 'Operations Administrator',
    department: 'Central Operations Command',
    phone: '9876543210',
    email: 'admin01@adani.com',
    status: 'active',
  },
  {
    id: 'b4s_Admin02',
    employeeId: 'b4s/Admin02',
    username: 'b4s/Admin02',
    password: 'Admin@02',
    name: 'Senior Operations Admin 02',
    role: 'admin',
    designation: 'Operations Administrator',
    department: 'Central Operations Command',
    phone: '9876543211',
    email: 'admin02@adani.com',
    status: 'active',
  },
  {
    id: 'b4s_Admin03',
    employeeId: 'b4s/Admin03',
    username: 'b4s/Admin03',
    password: 'Admin@03',
    name: 'Senior Operations Admin 03',
    role: 'admin',
    designation: 'Operations Administrator',
    department: 'Central Operations Command',
    phone: '9876543212',
    email: 'admin03@adani.com',
    status: 'active',
  },
];

export async function seedAdminUsersInFirestore(): Promise<void> {
  try {
    for (const admin of ADMIN_USERS) {
      const docRefUsers = doc(firestoreDb, 'users', admin.id);
      const docRefEmployees = doc(firestoreDb, 'employees', admin.id);
      await setDoc(docRefUsers, admin, { merge: true });
      await setDoc(docRefEmployees, admin, { merge: true });
    }
  } catch (err) {
    console.warn('Firestore admin seed notice:', err);
  }
}

// Automatically execute Firestore admin seeding asynchronously
seedAdminUsersInFirestore();

export default firebaseApp;
