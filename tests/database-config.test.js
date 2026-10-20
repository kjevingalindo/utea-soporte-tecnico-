const test = require('node:test');
const assert = require('node:assert/strict');
const {
    applyTestDatabaseEnvironment,
    resolveDatabaseConfig
} = require('../backend/config/databaseConfig');

function testEnvironment(overrides = {}) {
    return {
        UTEA_TEST_DB_ALLOW_INTEGRATION: '1',
        UTEA_TEST_DB_HOST: '127.0.0.1',
        UTEA_TEST_DB_PORT: '33107',
        UTEA_TEST_DB_USER: 'utea_test_runner',
        UTEA_TEST_DB_PASSWORD: 'fake-test-only-password',
        UTEA_TEST_DB_NAME: 'utea_support_test',
        JWT_SECRET: 'fake-test-only-jwt-secret',
        ...overrides
    };
}

test('test database configuration requires all explicit UTEA_TEST_DB values', () => {
    const env = testEnvironment();
    delete env.UTEA_TEST_DB_PASSWORD;
    assert.throws(() => applyTestDatabaseEnvironment(env), /UTEA_TEST_DB_PASSWORD/);
});

test('test configuration rejects normal schema names and non-local hosts', () => {
    assert.throws(
        () => resolveDatabaseConfig(testEnvironment({ UTEA_TEST_DB_NAME: 'tickets_db' })),
        /terminar en _test/
    );
    assert.throws(
        () => resolveDatabaseConfig(testEnvironment({ UTEA_TEST_DB_HOST: 'db.example.test' })),
        /localhost/
    );
});

test('test configuration maps only dedicated variables and never falls back to DB settings', () => {
    const env = testEnvironment({
        DB_HOST: 'institutional.example',
        DB_PORT: '3306',
        DB_USER: 'institutional-user',
        DB_PASSWORD: 'must-not-be-used',
        DB_NAME: 'tickets_db'
    });
    const config = applyTestDatabaseEnvironment(env);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 33107);
    assert.equal(config.user, 'utea_test_runner');
    assert.equal(config.password, 'fake-test-only-password');
    assert.equal(config.database, 'utea_support_test');
    assert.equal(env.DB_NAME, 'utea_support_test');
});

test('normal database configuration rejects missing values rather than silently connecting', () => {
    assert.throws(() => resolveDatabaseConfig({}), /Falta configuración explícita/);
});

test('normal database configuration permits an explicitly empty password', () => {
    const config = resolveDatabaseConfig({
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'local-user',
        DB_PASSWORD: '',
        DB_NAME: 'local-development'
    });
    assert.equal(config.password, '');
});
