'use client';

import { useState } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeCustomerVideoUrl } from '@/lib/customer-video-url';
import styles from './CustomerVideoLink.module.css';

export default function CustomerVideoLink({ assignmentId, url }: { assignmentId: string; url?: string }) {
    const saved = typeof url === 'string' ? url : '';
    const safeUrl = normalizeCustomerVideoUrl(saved);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const normalized = normalizeCustomerVideoUrl(draft);
        if (normalized === null) {
            setMessage('Geçerli bir YouTube video bağlantısı girin.');
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            await updateDoc(doc(db, 'assignments', assignmentId), { customerVideoUrl: normalized || deleteField() });
            setEditing(false);
            setMessage(normalized ? 'Bağlantı kaydedildi.' : 'Bağlantı kaldırıldı.');
        } catch {
            setMessage('Bağlantı kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setSaving(false);
        }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(saved);
            setMessage('Bağlantı kopyalandı.');
        } catch {
            setMessage('Kopyalanamadı. Bağlantıyı seçip elle kopyalayın.');
        }
    }

    return <div className={styles.editor}>
        <span className={styles.label}>Müşteri videosu</span>
        {editing ? <form onSubmit={save}>
            <label className={styles.label} htmlFor={`customer-video-${assignmentId}`}>YouTube video bağlantısı</label>
            <input id={`customer-video-${assignmentId}`} type="url" value={draft} onChange={event => { setDraft(event.target.value); setMessage(''); }} placeholder="https://www.youtube.com/watch?v=…" disabled={saving} />
            <p className={styles.hint}>Bağlantıyı kaldırmak için alanı boş bırakın.</p>
            <div className={styles.actions}>
                <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                <button type="button" disabled={saving} onClick={() => { setEditing(false); setMessage(''); }}>Vazgeç</button>
            </div>
        </form> : <>
            <span className={styles.url}>{saved || 'Henüz bağlantı eklenmedi.'}</span>
            <div className={styles.actions}>
                <button type="button" onClick={() => { setDraft(saved); setMessage(''); setEditing(true); }}>{saved ? 'Düzenle' : 'Bağlantı ekle'}</button>
                {safeUrl && <><a href={safeUrl} target="_blank" rel="noopener noreferrer">Videoya git</a><button type="button" onClick={copy}>Linki kopyala</button></>}
            </div>
        </>}
        <p className={styles.feedback} role="status">{message}</p>
    </div>;
}
