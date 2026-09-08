import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ error: 'Hesap silme özelliği BlumeCore üzerinde devre dışı bırakılmıştır.' }, { status: 405 });
}

export async function POST() {
    return NextResponse.json({ error: 'Hesap silme özelliği BlumeCore üzerinde devre dışı bırakılmıştır.' }, { status: 405 });
}

export async function DELETE() {
    return NextResponse.json({ error: 'Hesap silme özelliği BlumeCore üzerinde devre dışı bırakılmıştır.' }, { status: 405 });
}
