import { getApps, initializeApp, cert, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

function initAdminApp(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    const projectId =
        process.env.FIREBASE_ADMIN_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID;

    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

    if (clientEmail && privateKeyRaw) {
        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
        return initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey
            }),
            projectId
        });
    }

    // Fallback for environments where service account is provided via default credentials or in tests
    return initializeApp({
        projectId: projectId || 'mock-project-id'
    });
}

export const adminApp: App = initAdminApp();
export const adminDb: Firestore = getFirestore(adminApp);
export const adminAuth: Auth = getAuth(adminApp);
