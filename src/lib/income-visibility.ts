'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

export function useIncomeVisibility() {
    const { user } = useAuth();
    const [visibility, setVisibility] = useState<{ uid: string; showIncome: boolean; error: boolean } | null>(null);

    useEffect(() => {
        if (!user) return;

        return onSnapshot(doc(db, 'user_settings', user.uid), snapshot => {
            setVisibility({ uid: user.uid, showIncome: snapshot.data()?.showIncomeTotals === true, error: false });
        }, () => {
            setVisibility({ uid: user.uid, showIncome: false, error: true });
        });
    }, [user]);

    const loading = !user || visibility?.uid !== user.uid;
    const error = !loading && visibility?.error === true;
    return { showIncome: !loading && !error && visibility?.showIncome === true, loading, error };
}
