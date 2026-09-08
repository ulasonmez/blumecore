'use client';

import { usePathname } from 'next/navigation';
import BottomNav from "@/components/BottomNav";

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
        <>
            <main className="page-container">
                {children}
            </main>
            <BottomNav />
        </>
    );
}
