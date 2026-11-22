const adminIds = ['b4s_Admin01', 'b4s_Admin02', 'b4s_Admin03'];
const adminEmpIds = ['b4s/Admin01', 'b4s/Admin02', 'b4s/Admin03'];

async function wipeBackend() {
  try {
    console.log('Attempting to log in to backend API...');
    const loginRes = await fetch('https://adani-energy-app.vercel.app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'b4s/Admin01', password: 'Admin@01' })
    });

    const loginData = await loginRes.json();
    const token = loginData.access_token;

    if (!token) {
      console.log('Could not get token from backend API. Might be Firestore-only backend right now.');
      return;
    }

    console.log('Got token! Fetching employees from backend...');
    const empRes = await fetch('https://adani-energy-app.vercel.app/employees', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const emps = await empRes.json();

    if (Array.isArray(emps)) {
      let count = 0;
      for (const emp of emps) {
        const id = emp.id || emp._id || emp.employeeId;
        if (id && !adminIds.includes(id) && !adminEmpIds.includes(id)) {
          await fetch('https://adani-energy-app.vercel.app/employees/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          }).catch(()=>{});
          await fetch('https://adani-energy-app.vercel.app/employees/id/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          }).catch(()=>{});
          console.log('Deleted from Backend API:', id);
          count++;
        }
      }
      console.log(`Backend API wipe complete. Deleted ${count} non-admin employees.`);
    }
  } catch (e) {
    console.error('Backend API wipe error:', e.message);
  }
}

async function wipeFirestore() {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');

  const app = initializeApp({
    apiKey: 'AIzaSyD3PFo-2s8hw2A5KgK7herT9cU0WqmWGjg',
    projectId: 'adani-energy-2f5e0',
  });
  const db = getFirestore(app);

  console.log('Fetching records from Firestore...');
  let deletedCount = 0;

  const usersSnap = await getDocs(collection(db, 'users'));
  for (const d of usersSnap.docs) {
    if (!adminIds.includes(d.id) && !adminEmpIds.includes(d.id)) {
      await deleteDoc(doc(db, 'users', d.id)).catch(()=>{});
      console.log('Deleted Firestore user:', d.id);
      deletedCount++;
    }
  }

  const empsSnap = await getDocs(collection(db, 'employees'));
  for (const d of empsSnap.docs) {
    if (!adminIds.includes(d.id) && !adminEmpIds.includes(d.id)) {
      await deleteDoc(doc(db, 'employees', d.id)).catch(()=>{});
      console.log('Deleted Firestore employee:', d.id);
      deletedCount++;
    }
  }

  const attSnap = await getDocs(collection(db, 'attendance'));
  for (const d of attSnap.docs) {
    await deleteDoc(doc(db, 'attendance', d.id)).catch(()=>{});
    deletedCount++;
  }

  console.log(`Firestore wipe complete. Deleted ${deletedCount} documents.`);
}

async function run() {
  await wipeFirestore();
  await wipeBackend();
  console.log('All done!');
}

run();
