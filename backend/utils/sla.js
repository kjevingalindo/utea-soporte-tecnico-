const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const WORKDAY_START_MINUTE = 8 * 60;
const WORKDAY_END_MINUTE = 16 * 60 + 30;
const MINUTES_PER_WORKDAY = WORKDAY_END_MINUTE - WORKDAY_START_MINUTE;

const SLA_TARGETS = Object.freeze({
    Critica: Object.freeze({ responseMinutes: 60, resolutionMinutes: 240 }),
    Urgente: Object.freeze({ responseMinutes: 120, resolutionMinutes: 480 }),
    Alta: Object.freeze({ responseMinutes: 240, resolutionMinutes: 960 }),
    Media: Object.freeze({ responseMinutes: 480, resolutionMinutes: 1440 }),
    Baja: Object.freeze({ responseMinutes: 960, resolutionMinutes: 2400 })
});

function nextBusinessDay(date) {
    do {
        date.setUTCDate(date.getUTCDate() + 1);
    } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);

    date.setUTCHours(8, 0, 0, 0);
}

function normalizeToBusinessTime(date) {
    while (true) {
        const day = date.getUTCDay();
        if (day === 0 || day === 6) {
            nextBusinessDay(date);
            continue;
        }

        const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
        if (minuteOfDay < WORKDAY_START_MINUTE) {
            date.setUTCHours(8, 0, 0, 0);
            return;
        }
        if (minuteOfDay >= WORKDAY_END_MINUTE) {
            nextBusinessDay(date);
            continue;
        }
        return;
    }
}

function addBusinessMinutes(startTimestamp, minutes) {
    const start = Number(startTimestamp);
    const duration = Number(minutes);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 0) {
        throw new TypeError('La fecha y duración del SLA deben ser valores válidos');
    }

    const localDate = new Date(start - LIMA_OFFSET_MS);
    let remaining = duration;

    while (remaining > 0) {
        normalizeToBusinessTime(localDate);
        const minuteOfDay = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
        const availableMinutes = WORKDAY_END_MINUTE - minuteOfDay;
        const minutesToAdd = Math.min(remaining, availableMinutes);
        localDate.setUTCMinutes(localDate.getUTCMinutes() + minutesToAdd);
        remaining -= minutesToAdd;
    }

    return localDate.getTime() + LIMA_OFFSET_MS;
}

function calculateSlaDeadlines(startTimestamp, priority) {
    const targets = SLA_TARGETS[priority];
    if (!targets) throw new Error('Prioridad sin política SLA');

    return {
        responseDueAt: addBusinessMinutes(startTimestamp, targets.responseMinutes),
        resolutionDueAt: addBusinessMinutes(startTimestamp, targets.resolutionMinutes)
    };
}

module.exports = { SLA_TARGETS, addBusinessMinutes, calculateSlaDeadlines };