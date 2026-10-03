import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPendingPayments, type PendingPayment } from '../src/lib/pending-payments';

test('Tekil ödeme silme ve Firestore kayıt sırası değişince YouTuber grupları yer değiştirmez', () => {
    const youtubers = [
        { id: 'a', name: 'Alfa' },
        { id: 'b', name: 'Beta' },
        { id: 'z', name: 'Zeta' }
    ];
    const payments: PendingPayment[] = [
        { id: 'b-first', youtuberId: 'b', youtuberName: 'Eski Beta', amount: 10, description: '' },
        { id: 'z-only', youtuberId: 'z', youtuberName: 'Zeta', amount: 20, description: '' },
        { id: 'a-only', youtuberId: 'a', youtuberName: 'Alfa', amount: 30, description: '' },
        { id: 'b-second', youtuberId: 'b', youtuberName: 'Eski Beta', amount: 40, description: '' }
    ];

    const before = groupPendingPayments(payments, youtubers);
    const after = groupPendingPayments(
        payments.filter(payment => payment.id !== 'b-first').reverse(),
        youtubers
    );

    assert.deepEqual(before.map(group => group.youtuberKey), ['a', 'b', 'z']);
    assert.deepEqual(after.map(group => group.youtuberKey), ['a', 'b', 'z']);
    assert.equal(after[1].youtuberName, 'Beta');
    assert.equal(after[1].totalAmount, 40);
    assert.deepEqual(after[1].items.map(payment => payment.id), ['b-second']);
});

test('Silinmiş YouTuber için eski kayıt adları farklı olsa da grup sırası sabit kalır', () => {
    const youtubers = [{ id: 'a', name: 'Alfa' }, { id: 'z', name: 'Zeta' }];
    const payments: PendingPayment[] = [
        { id: 'o-first', youtuberId: 'orphan', youtuberName: 'Aaron', amount: 10, description: '' },
        { id: 'a-only', youtuberId: 'a', youtuberName: 'Alfa', amount: 20, description: '' },
        { id: 'z-only', youtuberId: 'z', youtuberName: 'Zeta', amount: 30, description: '' },
        { id: 'o-second', youtuberId: 'orphan', youtuberName: 'Yankee', amount: 40, description: '' }
    ];

    const before = groupPendingPayments(payments, youtubers);
    const after = groupPendingPayments(payments.filter(payment => payment.id !== 'o-first'), youtubers);

    assert.deepEqual(before.map(group => group.youtuberKey), ['a', 'orphan', 'z']);
    assert.deepEqual(after.map(group => group.youtuberKey), ['a', 'orphan', 'z']);
});
