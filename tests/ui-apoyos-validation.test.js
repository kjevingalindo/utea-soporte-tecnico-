/**
 * End-to-End UI validation test for Solicitudes de Apoyo Técnico para Eventos y Ambientes
 * UTEA Sede Andahuaylas
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { applyTestDatabaseEnvironment, ensureTestMysqlRunning } = require('../backend/config/databaseConfig');

const envFile = path.resolve(__dirname, '../.env.test.local');
if (fs.existsSync(envFile)) {
    const parsed = dotenv.parse(fs.readFileSync(envFile));
    for (const [key, val] of Object.entries(parsed)) {
        process.env[key] = val;
    }
}
process.env.UTEA_TEST_DB_ALLOW_INTEGRATION = '1';

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    try {
        ({ chromium } = require('playwright-core'));
    } catch {
        // Playwright no disponible
    }
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const hasChrome = fs.existsSync(chromePath);
const canRunBrowser = Boolean(chromium && hasChrome);

test('playwright end-to-end browser validation for apoyos a eventos', {
    timeout: 120000,
    skip: !canRunBrowser ? 'Playwright o Google Chrome no disponibles' : false
}, async (t) => {
    const APP_PORT = Number(process.env.UTEA_TEST_APP_PORT || 3107);
    const APP_URL = `http://127.0.0.1:${APP_PORT}`;
    const SEED_PASSWORD = 'Utea-Test-Browser-2026-10!';
    const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
    if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

    const createdApoyoIds = [];

    // 1. Asegurar backend de pruebas en ejecución
    console.log('[ETAPA 1/7] Verificando backend en puerto ' + APP_PORT + '...');
    const isPortListening = (port) => new Promise(resolve => {
        const s = new net.Socket();
        s.setTimeout(1000);
        s.once('connect', () => { s.destroy(); resolve(true); });
        s.once('timeout', () => { s.destroy(); resolve(false); });
        s.once('error', () => { s.destroy(); resolve(false); });
        s.connect(port, '127.0.0.1');
    });

    let serverProcess = null;
    let backendExitedPrematurely = false;

    if (!(await isPortListening(APP_PORT))) {
        console.log(`[ETAPA 1/7] Iniciando backend aislado de prueba en puerto ${APP_PORT}...`);
        serverProcess = spawn(process.execPath, ['scripts/run-test-env.js', 'start'], {
            cwd: path.resolve(__dirname, '..'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', data => {
            const line = data.toString().trim();
            if (line) console.log(`[BACKEND-STDOUT] ${line}`);
        });

        serverProcess.stderr.on('data', data => {
            const line = data.toString().trim();
            if (line) console.error(`[BACKEND-STDERR] ${line}`);
        });

        serverProcess.once('exit', code => {
            backendExitedPrematurely = true;
            if (code !== null && code !== 0) {
                console.error(`[BACKEND-EXIT] El backend terminó con código ${code}`);
            }
        });

        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (backendExitedPrematurely) {
                throw new Error('El backend de pruebas terminó prematuramente.');
            }
            if (await isPortListening(APP_PORT)) break;
        }
        assert.ok(await isPortListening(APP_PORT), `El servidor debe responder en puerto ${APP_PORT}`);
        console.log('[ETAPA 1/7] Backend de pruebas verificado.');
    } else {
        console.log('[ETAPA 1/7] Backend ya en ejecución en puerto ' + APP_PORT);
    }

    // Limpiar restos huérfanos de pruebas UI anteriores si quedaron
    {
        const config = applyTestDatabaseEnvironment(process.env);
        const conn = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database
        });
        try {
            const [oldRows] = await conn.query("SELECT id FROM solicitudes_apoyo WHERE nombre_actividad LIKE 'Sustentación Tesis Doctoral UI-%'");
            if (oldRows.length > 0) {
                const oldIds = oldRows.map(r => r.id);
                await conn.query('DELETE FROM notificaciones WHERE apoyo_id IN (?)', [oldIds]);
                await conn.query('DELETE FROM apoyo_recordatorios WHERE apoyo_id IN (?)', [oldIds]);
                await conn.query('DELETE FROM apoyo_historial WHERE apoyo_id IN (?)', [oldIds]);
                await conn.query('DELETE FROM solicitudes_apoyo WHERE id IN (?)', [oldIds]);
                console.log(`[SETUP] Limpiados ${oldIds.length} apoyos huérfanos de ejecuciones UI anteriores.`);
            }
        } finally {
            await conn.end();
        }
    }

    t.after(async () => {
        if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGTERM');
        }
        // Limpieza de apoyos creados
        if (createdApoyoIds.length > 0) {
            console.log(`[LIMPIEZA] Eliminando apoyos creados: ${createdApoyoIds.join(', ')}`);
            const config = applyTestDatabaseEnvironment(process.env);
            const conn = await mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password,
                database: config.database
            });
            try {
                await conn.query('DELETE FROM notificaciones WHERE apoyo_id IN (?)', [createdApoyoIds]);
                await conn.query('DELETE FROM apoyo_recordatorios WHERE apoyo_id IN (?)', [createdApoyoIds]);
                await conn.query('DELETE FROM apoyo_historial WHERE apoyo_id IN (?)', [createdApoyoIds]);
                await conn.query('DELETE FROM solicitudes_apoyo WHERE id IN (?)', [createdApoyoIds]);
                console.log('[LIMPIEZA] Datos de prueba eliminados exitosamente.');
            } catch (err) {
                console.error('[LIMPIEZA-ERROR] Error limpiando datos:', err.message);
            } finally {
                await conn.end();
            }
        }
    });

    const browser = await chromium.launch({
        executablePath: chromePath,
        headless: true
    });

    try {
        // --- ETAPA 2: Solicitante (Login, navegación y formulario de apoyo) ---
        console.log('[ETAPA 2/7] Solicitante inicia sesión y accede al formulario de apoyo...');
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.setDefaultNavigationTimeout(15000);
        page.setDefaultTimeout(15000);

        // Capturar IDs creados desde respuestas API
        page.on('response', async res => {
            if (res.url().includes('/api/apoyos') && res.request().method() === 'POST' && res.status() === 201) {
                try {
                    const data = await res.json();
                    if (data && data.solicitud?.id) {
                        createdApoyoIds.push(Number(data.solicitud.id));
                        console.log(`[APOYO-TRACK] Registrada solicitud de apoyo #${data.solicitud.id} (${data.solicitud.codigo})`);
                    }
                } catch (_) {}
            }
        });

        page.on('console', msg => console.log(`[PAGE-${msg.type()}] ${msg.text()}`));
        page.on('pageerror', err => console.error('[PAGE-ERROR]', err.message));

        await page.goto(`${APP_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#username', 'utea_ui_oct26_requester_a');
        await page.fill('#password', SEED_PASSWORD);
        await page.click('button.btn-login[type="submit"]');
        await page.waitForURL('**/index.html', { timeout: 12000, waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#usuarioActivo', { state: 'visible', timeout: 8000 });
        await page.waitForTimeout(500);

        // Ir a Mis tickets
        await page.evaluate(() => window.cambiarVista('tickets'));
        await page.waitForSelector('#btnSolicitarApoyoEvento', { state: 'visible', timeout: 8000 });

        // Click en "Solicitar apoyo para un evento"
        await page.click('#btnSolicitarApoyoEvento');
        await page.waitForSelector('#modalSolicitudApoyo', { state: 'visible', timeout: 5000 });

        // Llenar formulario
        await page.fill('#apoyoContacto', '983445566 - Anexo 104');
        await page.fill('#apoyoArea', 'Dirección de Posgrado e Investigación');
        await page.fill('#apoyoResponsable', 'Dra. Carmen Mendoza (Directora)');
        const actividadTitulo = `Sustentación Tesis Doctoral UI-${Date.now().toString().slice(-4)}`;
        await page.fill('#apoyoNombreActividad', actividadTitulo);
        await page.fill('#apoyoDescripcion', 'Sustentación presencial con jurado evaluador externo y transmisión en vivo para la comunidad académica.');

        // Selección de bloque y ambiente
        await page.selectOption('#apoyoBloque', 'Bloque A');
        await page.waitForFunction(() => {
            const select = document.getElementById('apoyoAmbiente');
            return select && !select.disabled && select.options.length > 1;
        }, null, { timeout: 5000 });
        await page.selectOption('#apoyoAmbiente', 'Auditorio');

        // Fecha y horario
        const fechaTarget = '2026-11-26';
        await page.fill('#apoyoFechaEvento', fechaTarget);
        await page.fill('#apoyoHoraPrep', '08:00');
        await page.fill('#apoyoHoraInicio', '08:30');
        await page.fill('#apoyoHoraFin', '12:00');

        // Checkboxes de tipos de apoyo
        await page.check('input[name="apoyos_requeridos"][value="proyector"]');
        await page.check('input[name="apoyos_requeridos"][value="sonido"]');
        await page.check('input[name="apoyos_requeridos"][value="microfonos"]');
        await page.check('input[name="apoyos_requeridos"][value="internet"]');

        await page.fill('#apoyoEquiposRecursos', 'Puntero láser inalámbrico y cable HDMI de 10 metros');

        // Archivo de autorización
        const testPdfPath = path.resolve(EVIDENCE_DIR, 'test_oficio_autorizacion.pdf');
        fs.writeFileSync(testPdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF');
        await page.setInputFiles('#apoyoArchivo', testPdfPath);

        // Captura 1: Formulario lleno
        const imgForm = path.resolve(EVIDENCE_DIR, '09_apoyos_solicitud_modal.png');
        await page.screenshot({ path: imgForm });
        console.log('[EVIDENCIA] Guardada captura:', imgForm);

        // Enviar formulario
        await page.click('#formSolicitudApoyo button[type="submit"]');
        await page.waitForSelector('#modalSolicitudApoyo', { state: 'hidden', timeout: 8000 });

        // --- ETAPA 3: Verificar en pestaña Solicitudes de apoyo para eventos ---
        console.log('[ETAPA 3/7] Verificando solicitud en pestaña de apoyos del solicitante...');
        await page.click('#tabMisApoyos');
        await page.waitForSelector('.apoyo-card-item', { state: 'visible', timeout: 8000 });

        const cardText = await page.textContent('#misApoyosLista');
        assert.ok(cardText.includes(actividadTitulo), 'La actividad solicitada debe listarse');
        assert.ok(cardText.includes('Auditorio'), 'Debe mostrar el ambiente');

        // Captura 2: Lista del solicitante
        const imgSolLista = path.resolve(EVIDENCE_DIR, '10_apoyos_solicitante_lista.png');
        await page.screenshot({ path: imgSolLista });
        console.log('[EVIDENCIA] Guardada captura:', imgSolLista);

        await page.close();

        // --- ETAPA 4: Administrador (Gestión y programación) ---
        console.log('[ETAPA 4/7] Autenticando Administrador para revisar y programar apoyo...');
        const adminPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        adminPage.setDefaultNavigationTimeout(15000);
        adminPage.setDefaultTimeout(15000);

        adminPage.on('console', msg => console.log(`[ADMIN-CONSOLE] ${msg.type()}: ${msg.text()}`));
        adminPage.on('pageerror', err => console.error('[ADMIN-PAGE-ERROR]', err.message));
        adminPage.on('response', async res => {
            if (res.url().includes('/programar')) {
                try {
                    const body = await res.json();
                    console.log(`[ADMIN-PROGRAMAR-RES ${res.status()}]`, JSON.stringify(body));
                } catch (_) {}
            }
        });

        await adminPage.goto(`${APP_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await adminPage.fill('#username', 'utea_ui_oct26_admin');
        await adminPage.fill('#password', SEED_PASSWORD);
        await adminPage.click('button.btn-login[type="submit"]');
        await adminPage.waitForURL('**/index.html', { timeout: 12000, waitUntil: 'domcontentloaded' });
        await adminPage.waitForSelector('#usuarioActivo', { state: 'visible', timeout: 8000 });

        // Verificar navegación de administrador
        const adminApoyosNav = await adminPage.$('#adminApoyosNav');
        assert.ok(adminApoyosNav, 'El administrador debe ver el acceso a Apoyos programados');
        await adminPage.waitForFunction(() => typeof window.cambiarVista === 'function', null, { timeout: 8000 });
        await adminPage.evaluate(() => window.cambiarVista('apoyos'));
        await adminPage.waitForSelector('#view-apoyos', { state: 'visible', timeout: 8000 });

        // Captura 3: Panel de gestión de apoyos admin
        const imgAdminPanel = path.resolve(EVIDENCE_DIR, '11_apoyos_admin_gestion.png');
        await adminPage.screenshot({ path: imgAdminPanel });
        console.log('[EVIDENCIA] Guardada captura:', imgAdminPanel);

        // Click en "Programar" sobre la solicitud creada específicamente en esta ejecución
        const targetApoyoId = createdApoyoIds[0];
        const btnSelector = `button[onclick*="abrirModalProgramar(${targetApoyoId})"]`;
        await adminPage.waitForSelector(btnSelector, { state: 'visible', timeout: 8000 });
        await adminPage.click(btnSelector);
        await adminPage.waitForSelector('#modalProgramarApoyo', { state: 'visible', timeout: 5000 });

        // Seleccionar técnico (priorizar 'Técnico de prueba' que se usa en Etapa 5)
        await adminPage.waitForFunction(() => {
            const sel = document.getElementById('adminProgramarTecnico');
            return sel && sel.options.length > 1;
        }, null, { timeout: 5000 });

        const techInfo = await adminPage.evaluate(() => {
            const sel = document.getElementById('adminProgramarTecnico');
            const options = Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
            let selectedVal = options[1]?.value;
            for (const opt of options) {
                if (opt.text.toLowerCase().includes('prueba')) {
                    selectedVal = opt.value;
                    break;
                }
            }
            return { options, selectedVal };
        });
        console.log('[DEBUG] Opciones de técnicos:', JSON.stringify(techInfo));
        await adminPage.selectOption('#adminProgramarTecnico', techInfo.selectedVal);

        // Captura 4: Modal de programación con técnico asignado
        const imgModalProg = path.resolve(EVIDENCE_DIR, '12_apoyos_admin_programacion.png');
        await adminPage.screenshot({ path: imgModalProg });
        console.log('[EVIDENCIA] Guardada captura:', imgModalProg);

        // Guardar programación
        await adminPage.click('#formProgramarApoyo button[type="submit"]');
        await adminPage.waitForSelector('#modalProgramarApoyo', { state: 'hidden', timeout: 6000 });
        console.log('[ETAPA 4/7] Apoyo programado con éxito.');

        await adminPage.close();

        // --- ETAPA 5: Técnico (Mis tareas de apoyo y confirmación) ---
        console.log('[ETAPA 5/7] Autenticando Técnico para revisar tareas asignadas...');
        const techPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        techPage.setDefaultNavigationTimeout(15000);
        techPage.setDefaultTimeout(15000);

        techPage.on('console', msg => console.log('[TECH-CONSOLE]', msg.text()));
        techPage.on('response', async res => {
            if (res.url().includes('/api/apoyos') && res.request().method() === 'GET') {
                try {
                    const json = await res.json();
                    console.log('[DEBUG-TECH-GET-APOYOS]', JSON.stringify(json).slice(0, 300));
                } catch (_) {}
            }
        });

        await techPage.goto(`${APP_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await techPage.fill('#username', 'utea_ui_oct26_technician');
        await techPage.fill('#password', SEED_PASSWORD);
        await techPage.click('button.btn-login[type="submit"]');
        await techPage.waitForURL('**/index.html', { timeout: 12000, waitUntil: 'domcontentloaded' });
        await techPage.waitForSelector('#usuarioActivo', { state: 'visible', timeout: 8000 });

        // Técnico navega a "Mis tareas de apoyo"
        await techPage.waitForFunction(() => typeof window.cambiarVista === 'function', null, { timeout: 8000 });
        await techPage.evaluate(() => window.cambiarVista('tecnico-apoyos'));
        await techPage.waitForSelector('#view-tecnico-apoyos', { state: 'visible', timeout: 8000 });

        // Pestaña "Próximas"
        await techPage.click('button.tech-subtab-btn[data-tab="proximas"]');
        await techPage.waitForSelector('.tech-task-card', { state: 'visible', timeout: 6000 });

        const taskText = await techPage.textContent('#techTareasContainer');
        assert.ok(taskText.includes(actividadTitulo), 'El técnico debe ver el evento asignado en Próximas');

        // Confirmar recepción si botón visible
        const btnConfirmar = await techPage.$('button:has-text("Confirmar recepción")');
        if (btnConfirmar) {
            await btnConfirmar.click();
            await techPage.waitForTimeout(1000);
        }

        // Captura 5: Tareas del técnico
        const imgTechTareas = path.resolve(EVIDENCE_DIR, '13_apoyos_tecnico_tareas.png');
        await techPage.screenshot({ path: imgTechTareas });
        console.log('[EVIDENCIA] Guardada captura:', imgTechTareas);

        await techPage.close();

        // --- ETAPA 6: Reportes con métricas de apoyos diferenciadas ---
        console.log('[ETAPA 6/7] Verificando métricas de apoyos en Reporte mensual...');
        const reportPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        reportPage.setDefaultNavigationTimeout(15000);
        reportPage.setDefaultTimeout(15000);

        await reportPage.goto(`${APP_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await reportPage.fill('#username', 'utea_ui_oct26_admin');
        await reportPage.fill('#password', SEED_PASSWORD);
        await reportPage.click('button.btn-login[type="submit"]');
        await reportPage.waitForURL('**/index.html', { timeout: 12000, waitUntil: 'domcontentloaded' });

        await reportPage.waitForFunction(() => typeof window.cambiarVista === 'function', null, { timeout: 8000 });
        await reportPage.evaluate(() => window.cambiarVista('reportes'));
        await reportPage.waitForSelector('#view-reportes', { state: 'visible', timeout: 8000 });
        await reportPage.waitForTimeout(1500);

        // Captura 6: Reporte mensual con indicadores
        const imgReportes = path.resolve(EVIDENCE_DIR, '14_apoyos_reporte_metricas.png');
        await reportPage.screenshot({ path: imgReportes });
        console.log('[EVIDENCIA] Guardada captura:', imgReportes);

        await reportPage.close();

        console.log('[ETAPA 7/7] Validación de interfaz completada con éxito. 6 capturas generadas.');
    } finally {
        await browser.close().catch(() => {});
    }
});

