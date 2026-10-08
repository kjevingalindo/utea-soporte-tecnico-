const crypto = require('crypto');

function sortObject(value) {
    if (Array.isArray(value)) return value.map(sortObject);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((sorted, key) => {
            sorted[key] = sortObject(value[key]);
            return sorted;
        }, {});
    }
    return value;
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(sortObject(value))).digest('hex');
}

module.exports = { fingerprint };
