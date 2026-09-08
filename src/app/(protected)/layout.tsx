import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookieOwner } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function ProtectedServerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value;

    const result = await verifySessionCookieOwner(sessionCookie);

    if (!result.ok) {
        if (result.reason === 'missing') {
            redirect('/login');
        }
        // If revoked, invalid, unauthorized UID, or missing admin env -> redirect to unauthorized error
        redirect('/login?error=unauthorized');
    }

    return <>{children}</>;
}
