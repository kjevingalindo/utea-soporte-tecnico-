const test = require('node:test');
const assert = require('node:assert/strict');
const { addBusinessMinutes, calculateSlaDeadlines } = require('../backend/utils/sla');

function limaTime(year, month, day, hour, minute = 0) {
    return Date.UTC(year, month - 1, day, hour + 5, minute);
}

test('moves a before-opening start to the workday opening', () => {
    const deadline = addBusinessMinutes(limaTime(2026, 9, 28, 7, 30), 60);
    assert.equal(deadline, limaTime(2026, 9, 28, 9));
});

test('carries remaining time from Friday into Monday', () => {
    const deadline = addBusinessMinutes(limaTime(2026, 9, 25, 16), 60);
    assert.equal(deadline, limaTime(2026, 9, 28, 8, 30));
});

test('starts a weekend ticket on Monday at opening time', () => {
    const deadline = addBusinessMinutes(limaTime(2026, 9, 26, 11), 60);
    assert.equal(deadline, limaTime(2026, 9, 28, 9));
});

test('uses the selected priority targets', () => {
    const deadlines = calculateSlaDeadlines(limaTime(2026, 9, 28, 8), 'Media');
    assert.equal(deadlines.responseDueAt, limaTime(2026, 9, 28, 16));
    assert.equal(deadlines.resolutionDueAt, limaTime(2026, 9, 30, 15));
});