import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsToCustomers } from './customerSheet.js';

test('reads customers and skips duplicates and bad rows', () => {
  const rows = [
    ['Customer Name', 'Mobile', 'City', 'Credit Balance'],
    ['Asha', '9000000001', 'Pune', '₹1,200'],
    ['Asha again', '+91 90000-00001', '', ''],
    ['Ravi', '', '', ''],
    ['Old', '9000000002', '', ''],
    ['', '9000000003', '', ''],
    ['Bad credit', '9000000004', '', 'abc']
  ];
  const result = rowsToCustomers(rows, [{ name: 'Old', phone: '9000000002' }]);
  assert.deepEqual(result.customers, [
    { name: 'Asha', phone: '9000000001', city: 'Pune', totalCredit: 1200 },
    { name: 'Ravi', phone: '', city: '', totalCredit: 0 }
  ]);
  assert.equal(result.duplicates, 2);
  assert.equal(result.invalid, 2);
});

test('reads amount paid and purchase date', () => {
  const rows = [
    ['Name', 'Amount Paid', 'Outstanding Balance', 'Date of Purchase'],
    ['A', '500', '100', '2026-11-05'],
    ['B', '0', '50', '05/11/2026'],
    ['C', '10', '0', '46331'],
    ['D', '10', '0', '31-02-2026']
  ];
  const { customers, invalid } = rowsToCustomers(rows);
  assert.deepEqual(customers.map(c => [c.amountPaid, c.totalCredit, c.lastVisit]), [
    [500, 100, '2026-11-05'],
    [0, 50, '2026-11-05'],
    [10, 0, '2026-11-05']
  ]);
  assert.equal(invalid, 1);
});

test('requires a name column', () => {
  assert.throws(() => rowsToCustomers([['Phone'], ['9000000001']]), /Name/);
});
