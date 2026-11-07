'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeChannelUrl } from '@/lib/channel-url';
import styles from './ChannelLinkEditor.module.css';

export default function ChannelLinkEditor({ youtuberId }: { youtuberId: string }) {
    const [savedValue, setSavedValue] = useState('');
    const [draft, setDraft] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const value = draft ?? savedValue;

    useEffect(() => onSnapshot(doc(db, 'youtubers', youtuberId), snapshot => {
        const url = snapshot.data()?.channelUrl;
        setSavedValue(typeof url === 'string' ? url : '');
        setReady(snapshot.exists());
        if (!snapshot.exists()) { setMessage('YouTuber kaydı bulunamadı.'); setIsError(true); }
    }, () => {
        setReady(false);
        setMessage('Kanal linki yüklenemedi.');
        setIsError(true);
    }), [youtuberId]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!ready || saving) return;
        const normalized = normalizeChannelUrl(value);
        if (normalized === null) {
            setMessage('Geçerli bir bağlantı girin (örn. https://youtube.com/@kanaladi).');
            setIsError(true);
            return;
        }
        setSaving(true);
        setMessage('');
        setIsError(false);
        try {
            await updateDoc(doc(db, 'youtubers', youtuberId), {
                channelUrl: normalized || deleteField(),
            });
            setSavedValue(normalized);
            setDraft(null);
            setMessage(normalized ? 'Kanal linki kaydedildi.' : 'Kanal linki kaldırıldı.');
        } catch {
            setMessage('Kaydedilemedi. Lütfen tekrar deneyin.');
            setIsError(true);
        } finally {
            setSaving(false);
        }
    }

    const unchanged = value.trim() === savedValue;

    return (
        <div className={styles.wrapper}>
            <button type="button" className={styles.toggle} aria-expanded={open}
                aria-controls={`channel-panel-${youtuberId}`} onClick={() => setOpen(prev => !prev)}>
                <span className={styles.toggleText}>
                    <span>Kanal linki</span>
                    <span className={styles.status}>
                        {ready ? (savedValue || 'Henüz eklenmedi') : 'Yükleniyor…'}
                    </span>
                </span>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {open && (
                <form id={`channel-panel-${youtuberId}`} className={styles.panel} onSubmit={save}>
                    <div className={styles.inputRow}>
                        <input type="url" inputMode="url" aria-label="Kanal linki" placeholder="https://youtube.com/@kanaladi"
                            autoComplete="off" value={value} disabled={!ready || saving}
                            onChange={event => { setDraft(event.target.value); setMessage(''); setIsError(false); }} />
                        <button type="submit" className="btn-primary" disabled={!ready || saving || unchanged}>
                            {saving ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                    </div>
                    <p className={styles.hint}>Linki kaldırmak için alanı boş bırakıp kaydedin.</p>
                    <p className={`${styles.feedback} ${isError ? styles.error : ''}`} role="status">{message}</p>
                </form>
            )}
        </div>
    );
}
