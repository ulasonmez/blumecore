'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, X } from 'lucide-react';
import { buildDiscordExport, selectDiscordContacts, type DiscordContact, type DiscordExportCategory } from '@/lib/discord-contacts';
import styles from './DiscordContacts.module.css';

interface DiscordExportProps {
    contacts: DiscordContact[];
    categories?: DiscordExportCategory[];
}

export default function DiscordExport({ contacts, categories }: DiscordExportProps) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={styles.exportButton} onClick={() => setOpen(true)}>
            <Download size={14} /> Export
        </button>
        {open && <ExportDialog contacts={contacts} categories={categories} onClose={() => setOpen(false)} />}
    </>;
}

function ExportDialog({ contacts, categories, onClose }: DiscordExportProps & { onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [message, setMessage] = useState('');
    const [selectedNames, setSelectedNames] = useState(() => categories?.map(category => category.name) ?? []);
    const content = buildDiscordExport(categories ? selectDiscordContacts(categories, selectedNames) : contacts);
    function updateSelection(names: string[]) {
        setSelectedNames(names);
        setMessage('');
    }
    const count = content ? content.split('\n').length : 0;
    useEffect(() => { dialog.current?.showModal(); }, []);

    async function copy() {
        try {
            await navigator.clipboard.writeText(content);
            setMessage('Kopyalandı.');
        } catch {
            textarea.current?.focus();
            textarea.current?.select();
            setMessage('Panoya erişilemedi. Seçili metni elle kopyalayabilirsiniz.');
        }
    }

    return (
        <dialog ref={dialog} className={styles.dialog} aria-labelledby="discord-export-title" onCancel={onClose}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
            <div className={styles.dialogContent}>
                <div className={styles.dialogHeader}>
                    <h2 id="discord-export-title">Discord Export</h2>
                    <button type="button" onClick={onClose} aria-label="Kapat"><X size={22} /></button>
                </div>
                {categories && (
                    <fieldset className={styles.categoryFieldset}>
                        <legend>Kategorileri seç</legend>
                        <div className={styles.selectionActions}>
                            <button type="button" onClick={() => updateSelection(categories.map(category => category.name))}>Tümünü seç</button>
                            <button type="button" onClick={() => updateSelection([])}>Seçimi temizle</button>
                        </div>
                        <div className={styles.categoryList}>
                            {categories.map(category => (
                                <label key={category.name} className={styles.categoryOption}>
                                    <input type="checkbox" checked={selectedNames.includes(category.name)}
                                        onChange={event => updateSelection(event.target.checked
                                            ? [...selectedNames, category.name]
                                            : selectedNames.filter(name => name !== category.name))} />
                                    <span>{category.name}</span>
                                </label>
                            ))}
                        </div>
                        {categories.length === 0 && <p className={styles.hint}>Gösterilecek kategori yok.</p>}
                    </fieldset>
                )}
                <p className={styles.hint}>{categories ? 'Seçili kategorilerde ve mevcut aramada' : 'Mevcut arama ve filtrelerde'} Discord ID’si bulunan {count} YouTuber. Her kişi bir kez listelenir.</p>
                <textarea ref={textarea} aria-label="Kopyalanabilir Discord listesi" readOnly value={content}
                    placeholder={categories && selectedNames.length === 0 ? "Metni oluşturmak için bir kategori seçin." : "Bu listede Discord ID’si eklenmiş YouTuber yok."} className={styles.exportText} />
                <div className={styles.exportFooter}>
                    <span role="status" className={styles.hint}>{message}</span>
                    <button type="button" className="btn-primary" onClick={copy} disabled={!content}><Copy size={16} /> Kopyala</button>
                </div>
            </div>
        </dialog>
    );
}
