'use client';

import { usePathname } from 'next/navigation';
import BottomNav from "@/components/BottomNav";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return (
            <main>
                {children}
            </main>
        );
    }

    return (
        <ProtectedRoute>
            <main className="page-container">
                {children}
            </main>
            <BottomNav />
        </ProtectedRoute>
    );
}
