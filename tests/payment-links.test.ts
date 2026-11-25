import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildAssignmentPaymentMap,
    filterLinksToAssignments,
    getAssignmentPaymentStatus,
    readPaidAssignments,
} from '../src/lib/payment-links';

test('readPaidAssignments geçersiz girdileri atar ve tekrarları birleştirir', () => {
    assert.deepEqual(readPaidAssignments(undefined), []);
    assert.deepEqual(readPaidAssignments('x'), []);
    assert.deepEqual(
        readPaidAssignments([
            { assignmentId: 'a', coverage: 'partial' },
            { assignmentId: 'a', coverage: 'full' },
            { assignmentId: '', coverage: 'full' },
            { assignmentId: 'b' },
            null,
            { assignmentId: 'c', coverage: 'partial' },
            { assignmentId: 'c', coverage: 'weird' },
        ]),
        [
            { assignmentId: 'a', coverage: 'full' },
            { assignmentId: 'b', coverage: 'full' },
            { assignmentId: 'c', coverage: 'full' },
        ],
    );
});

test('Bir ödeme birden fazla videoyu kapsar; tam > kısmi > ödenmedi', () => {
    const records = [
        { id: 'r1', type: 'income', paidAssignments: [{ assignmentId: 'a1', coverage: 'full' }, { assignmentId: 'a2', coverage: 'partial' }] },
        { id: 'r2', type: 'income', paidAssignments: [{ assignmentId: 'a3', coverage: 'partial' }] },
        { id: 'r3', type: 'income', paidAssignments: [{ assignmentId: 'a3', coverage: 'full' }] },
        { id: 'r4', type: 'expense', paidAssignments: [{ assignmentId: 'a4', coverage: 'full' }] },
        { id: 'r5', type: 'income' },
    ];
    const map = buildAssignmentPaymentMap(records);
    assert.equal(getAssignmentPaymentStatus(map, 'a1'), 'paid');
    assert.equal(getAssignmentPaymentStatus(map, 'a2'), 'partial');
    assert.equal(getAssignmentPaymentStatus(map, 'a3'), 'paid');
    assert.deepEqual(map.get('a3')?.recordIds, ['r2', 'r3']);
    assert.equal(getAssignmentPaymentStatus(map, 'a4'), 'unpaid', 'gider kayıtları ödeme sayılmaz');
    assert.equal(getAssignmentPaymentStatus(map, 'missing'), 'unpaid');
});

test('Düzenlenen kayıt hariç tutulabilir ve bağlantılar YouTuber atamalarıyla sınırlanır', () => {
    const records = [
        { id: 'r1', type: 'income', paidAssignments: [{ assignmentId: 'a1', coverage: 'full' }] },
        { id: 'r2', type: 'income', paidAssignments: [{ assignmentId: 'a1', coverage: 'partial' }] },
    ];
    assert.equal(getAssignmentPaymentStatus(buildAssignmentPaymentMap(records, 'r1'), 'a1'), 'partial');
    assert.deepEqual(
        filterLinksToAssignments([{ assignmentId: 'a1', coverage: 'full' }, { assignmentId: 'other', coverage: 'partial' }], ['a1']),
        [{ assignmentId: 'a1', coverage: 'full' }],
    );
});
