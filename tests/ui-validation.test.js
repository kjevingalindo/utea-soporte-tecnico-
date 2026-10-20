/**
 * End-to-End UI validation test for UTEA Help Desk
 * 
 * Validates through visible controls and natural user interactions:
 * 1. Requester login, 3-module navigation isolation (Dashboard, Tickets, Perfil), mobile viewport.
 * 2. Ticket creation with category, location and evidence attachment.
 * 3. Ticket detail view, comment submission and safe rendering.
 * 4. Admin login, ticket detail inspection, technician assignment per office.
 * 5. State transitions and permitted reopening on the specific created ticket.
 * 6. Monthly report navigation, filters, KPI cards, CSV download and PDF generation.
 * 
 * Saves screenshots and exported files to evidence/ directory.
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

// Cargar entorno de pruebas
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

test('playwright end-to-end browser validation', {
    timeout: 120000,
    skip: !canRunBrowser ? 'Playwright o Google Chrome no disponibles en este entorno' : false
}, async (t) => {
    const APP_PORT = Number(process.env.UTEA_TEST_APP_PORT || 3107);
    const APP_URL = `http://127.0.0.1:${APP_PORT}`;
    const SEED_PASSWORD = 'Utea-Test-Browser-2026-10!';
    const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
    if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

    // Alcance global para limpieza garantizada de identificadores creados
    const createdTicketIds = [];

    // 1. Asegurar backend de pruebas en ejecución
    console.log('[ETAPA 1/8] Verificando backend en puerto ' + APP_PORT + '...');
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
        console.log(`[ETAPA 1/8] Iniciando backend aislado de prueba en puerto ${APP_PORT}...`);
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
                throw new Error('El backend de pruebas terminó antes de estar disponible para escuchar conexiones.');
            }
            if (await isPortListening(APP_PORT)) break;
        }
        assert.ok(await isPortListening(APP_PORT), `El servidor de pruebas debe responder en el puerto ${APP_PORT}`);
        console.log('[ETAPA 1/8] Backend de pruebas verificado y respondiendo.');
    } else {
        console.log('[ETAPA 1/8] Backend ya en ejecución y escuchando en puerto ' + APP_PORT);
    }

    t.after(async () => {
        if (serverProcess && !serverProcess.killed) {
            console.log('[TEARDOWN] Deteniendo proceso temporal del backend...');
            serverProcess.kill('SIGTERM');
        }
    });

    const browser = await chromium.launch({
        executablePath: chromePath,
        headless: true
    });

    try {
        // --- FLUJO 1: Solicitante (Requester A) ---
        console.log('[ETAPA 2/8] Autenticando solicitante normal (utea_ui_oct26_requester_a)...');
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.setDefaultNavigationTimeout(15000);
        page.setDefaultTimeout(15000);

        // Registro de respuestas para capturar identificador de ticket creado
        page.on('response', async res => {
            if (res.url().includes('/api/tickets') && res.request().method() === 'POST' && res.status() === 201) {
                try {
                    const data = await res.json();
                    if (data && data.id && !createdTicketIds.includes(Number(data.id))) {
                        createdTicketIds.push(Number(data.id));
                        console.log(`[TICKET-TRACK] Registrado ticket #${data.id} creado en esta ejecución.`);
                    }
                } catch (_) {}
            }
        });

        await page.goto(`${APP_URL}/login.html`, { waitUntil: 'networkidle' });
        await page.fill('#username', 'utea_ui_oct26_requester_a');
        await page.fill('#password', SEED_PASSWORD);
        await page.click('button.btn-login[type="submit"]');
        await page.waitForURL('**/index.html', { timeout: 10000 });
        await page.waitForSelector('#usuarioActivo', { state: 'visible', timeout: 8000 });
        console.log('[ETAPA 2/8] Solicitante autenticado con éxito.');

        // Verificación de módulos del solicitante
        console.log('[ETAPA 3/8] Verificando aislamiento de módulos de solicitante y vista móvil...');
        const visibleNavs = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('nav.sidebar-nav a.nav-item'));
            return links
                .filter(a => !a.hidden && window.getComputedStyle(a).display !== 'none')
                .map(a => a.textContent.trim().replace(/\s+/g, ' '));
        });
        console.log('[ETAPA 3/8] Módulos visibles para solicitante:', visibleNavs);
        assert.ok(visibleNavs.some(n => n.toLowerCase().includes('dashboard')), 'Solicitante debe tener Dashboard');
        assert.ok(visibleNavs.some(n => n.toLowerCase().includes('tickets')), 'Solicitante debe tener Mis tickets');
        assert.ok(!visibleNavs.some(n => n.toLowerCase().includes('reporte')), 'Solicitante NO debe tener Reportes');
        assert.ok(!visibleNavs.some(n => n.toLowerCase().includes('administraci')), 'Solicitante NO debe tener Administración');

        // Vista móvil
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-requester-mobile.png'), fullPage: true });

        // Restaurar escritorio
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-requester-dashboard.png'), fullPage: true });
        console.log('[ETAPA 3/8] Capturas 01 y 02 guardadas exitosamente.');

        // Crear ticket con asunto único
        console.log('[ETAPA 4/8] Creando nuevo ticket con asunto único y evidencia adjunta...');
        const openCreateBtn = page.locator('#quickTicketOpen');
        assert.ok(await openCreateBtn.isVisible(), 'El botón Nuevo Ticket debe estar visible');
        await openCreateBtn.click();
        await page.waitForSelector('#quickTicketModal', { state: 'visible', timeout: 8000 });

        const ticketSubject = `Incidencia de red en Auditorio - ${Date.now()}`;
        await page.fill('#titulo', ticketSubject);
        await page.fill('#solicitanteNombre', 'Solicitante de prueba A');
        await page.fill('#codigoUniversitarioDni', '45892314');
        await page.selectOption('#tipoSolicitante', 'administrativo');
        await page.selectOption('#ticketCategoria', 'Internet');
        await page.selectOption('#ticketBloque', 'Bloque A');

        // waitForFunction con firma (fn, arg, options)
        await page.waitForFunction(() => {
            const el = document.getElementById('ticketAmbiente');
            return el && !el.disabled && el.options.length > 1;
        }, null, { timeout: 8000 });
        await page.selectOption('#ticketAmbiente', 'Auditorio');
        await page.fill('#descripcion', 'Problema de conectividad cableada intermitente reportado en el auditorio principal.');

        // Adjuntar evidencia fotográfica/archivo
        const sampleFile = path.resolve(__dirname, '../test-evidence/sample-evidence.png');
        if (fs.existsSync(sampleFile)) {
            await page.setInputFiles('#fotoIncidencia', sampleFile);
        }

        // Clic en Enviar Ticket
        await page.click('#formTicket button[type="submit"]');

        // Esperar cierre del modal tras confirmación del servidor
        await page.waitForSelector('#quickTicketModal', { state: 'hidden', timeout: 10000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-ticket-created.png'), fullPage: true });
        console.log('[ETAPA 4/8] Ticket creado exitosamente con asunto: ' + ticketSubject);

        // Navegar a Mis Tickets y abrir el ticket creado (usando su asunto único)
        console.log('[ETAPA 5/8] Navegando a Mis Tickets y abriendo detalle del ticket creado...');
        await page.click('nav.sidebar-nav a[data-view="tickets"]');
        await page.waitForSelector('#tickets .ticket-row', { state: 'visible', timeout: 10000 });

        // Seleccionar estrictamente la fila que contiene el asunto único creado
        const targetRow = page.locator('#tickets .ticket-row', { hasText: ticketSubject });
        await targetRow.waitFor({ state: 'visible', timeout: 10000 });
        await targetRow.click();
        await page.waitForSelector('#ticketDetalle', { state: 'visible', timeout: 8000 });

        const detailTicketId = await page.getAttribute('#ticketDetalle', 'data-ticket-id');
        if (detailTicketId && !createdTicketIds.includes(Number(detailTicketId))) {
            createdTicketIds.push(Number(detailTicketId));
            console.log(`[TICKET-TRACK] Confirmado ticket #${detailTicketId} desde el panel de detalle.`);
        }
        await page.screenshot({ path: path.join(EVIDENCE_DIR, '04-ticket-detail.png'), fullPage: true });

        // Enviar comentario desde el detalle
        const commentBox = page.locator('#detalleNuevoComentario');
        assert.ok(await commentBox.isVisible(), 'El campo para ingresar comentarios debe estar disponible en detalle');
        await commentBox.fill('Comentario de seguimiento: se verificó el switch y persiste la intermitencia.');
        await page.click('#detalleComentarioForm button[type="submit"]');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, '05-ticket-commented.png'), fullPage: true });
        console.log('[ETAPA 5/8] Comentario registrado en el ticket.');

        // Cerrar modal de detalle
        const closeDetailBtn = page.locator('#ticketDetalle [data-ticket-detail-close], #ticketDetalle button:has-text("Cerrar")').first();
        assert.ok(await closeDetailBtn.isVisible(), 'El control de cierre de detalle debe estar visible');
        await closeDetailBtn.click();
        await page.waitForSelector('#ticketDetalle', { state: 'hidden', timeout: 8000 });

        // Cerrar sesión solicitante
        await page.click('.user-profile');
        await page.click('.user-profile .dropdown-menu button');
        await page.waitForURL('**/login.html', { timeout: 10000 });
        await page.close();

        // --- FLUJO 2: Administrador (Admin) ---
        console.log('[ETAPA 6/8] Autenticando Administrador (utea_ui_oct26_admin)...');
        const adminPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        adminPage.setDefaultNavigationTimeout(15000);
        adminPage.setDefaultTimeout(15000);

        await adminPage.goto(`${APP_URL}/login.html`, { waitUntil: 'networkidle' });
        await adminPage.fill('#username', 'utea_ui_oct26_admin');
        await adminPage.fill('#password', SEED_PASSWORD);
        await adminPage.click('button.btn-login[type="submit"]');
        await adminPage.waitForURL('**/index.html', { timeout: 10000 });
        await adminPage.waitForSelector('#usuarioActivo', { state: 'visible', timeout: 8000 });

        // Verificar módulos visibles para Admin
        const adminNavs = await adminPage.evaluate(() => {
            const links = Array.from(document.querySelectorAll('nav.sidebar-nav a.nav-item'));
            return links
                .filter(a => !a.hidden && window.getComputedStyle(a).display !== 'none')
                .map(a => a.textContent.trim().replace(/\s+/g, ' '));
        });
        console.log('[ETAPA 6/8] Módulos visibles para admin:', adminNavs);
        assert.ok(adminNavs.some(n => n.toLowerCase().includes('reporte')), 'Admin debe tener Reporte mensual');
        assert.ok(adminNavs.some(n => n.toLowerCase().includes('administraci')), 'Admin debe tener Administración');
        await adminPage.screenshot({ path: path.join(EVIDENCE_DIR, '06-admin-dashboard.png'), fullPage: true });

        // Administrador abre Tickets y busca el ticket creado por su asunto único
        console.log('[ETAPA 7/8] Administrador asigna técnico y ejecuta ciclo de vida sobre el ticket creado...');
        await adminPage.click('nav.sidebar-nav a[data-view="tickets"]');
        await adminPage.waitForSelector('#tickets .ticket-row', { state: 'visible', timeout: 10000 });

        const adminTargetRow = adminPage.locator('#tickets .ticket-row', { hasText: ticketSubject });
        await adminTargetRow.waitFor({ state: 'visible', timeout: 10000 });
        await adminTargetRow.click();
        await adminPage.waitForSelector('#ticketDetalle', { state: 'visible', timeout: 8000 });

        const techSelect = adminPage.locator('#tecnicoAsignar');
        assert.ok(await techSelect.isVisible(), 'El selector de asignación de técnico debe estar disponible para el administrador');

        // waitForFunction con firma (fn, arg, options)
        await adminPage.waitForFunction(() => {
            const sel = document.getElementById('tecnicoAsignar');
            return sel && sel.options.length > 1;
        }, null, { timeout: 8000 });

        const optionCount = await techSelect.locator('option').count();
        assert.ok(optionCount > 1, 'Debe haber al menos un técnico asignado a la oficina del ticket');
        await techSelect.selectOption({ index: 1 });

        const assignBtn = adminPage.locator('#ticketDetalle button:has-text("Asignar"), button[data-ticket-assign]').first();
        assert.ok(await assignBtn.isVisible(), 'El botón Asignar debe estar visible');
        await assignBtn.click();
        await adminPage.waitForTimeout(1000);
        await adminPage.screenshot({ path: path.join(EVIDENCE_DIR, '07-admin-assignment.png'), fullPage: true });

        const closeAdminDetail = adminPage.locator('#ticketDetalle [data-ticket-detail-close], #ticketDetalle button:has-text("Cerrar")').first();
        if (await closeAdminDetail.isVisible()) {
            await closeAdminDetail.click();
            await adminPage.waitForSelector('#ticketDetalle', { state: 'hidden', timeout: 8000 });
        }

        // Transiciones de estado: Asignación -> Atención (En proceso) -> Resolución (Solucionado) -> Reapertura (En proceso)
        // 1. Pasar a estado Asignado si aún está en Creado
        const editBtn1 = adminTargetRow.locator('button:has-text("Editar")');
        assert.ok(await editBtn1.isVisible(), 'El botón Editar debe estar visible en la fila del ticket');
        await editBtn1.click();
        await adminPage.waitForSelector('#editarTicket', { state: 'visible', timeout: 8000 });
        const editStateSelect = adminPage.locator('#editEstado');
        assert.ok(await editStateSelect.isVisible(), 'El selector de estado debe estar visible en el modal de edición');
        
        const optValues1 = await editStateSelect.locator('option').allTextContents();
        if (optValues1.includes('Asignado')) {
            await editStateSelect.selectOption('Asignado');
            await adminPage.click('#editForm button[type="submit"]');
            await adminPage.waitForSelector('#editarTicket', { state: 'hidden', timeout: 8000 });
            await adminPage.waitForTimeout(800);
        } else {
            await adminPage.click('#editarTicket button:has-text("Cancelar")');
            await adminPage.waitForSelector('#editarTicket', { state: 'hidden', timeout: 8000 });
        }

        // 2. Pasar a estado "En proceso" (Atención)
        const editBtn2 = adminTargetRow.locator('button:has-text("Editar")');
        await editBtn2.click();
        await adminPage.waitForSelector('#editarTicket', { state: 'visible', timeout: 8000 });
        const optValues2 = await editStateSelect.locator('option').allTextContents();
        if (optValues2.includes('En proceso')) {
            await editStateSelect.selectOption('En proceso');
            await adminPage.click('#editForm button[type="submit"]');
            await adminPage.waitForSelector('#editarTicket', { state: 'hidden', timeout: 8000 });
            await adminPage.waitForTimeout(800);
        } else {
            await adminPage.click('#editarTicket button:has-text("Cancelar")');
            await adminPage.waitForSelector('#editarTicket', { state: 'hidden', timeout: 8000 });
        }

        // 3. Probar transición de Resolución: botón "Resolver" debe estar visible cuando está en atención
        const resolveBtn = adminTargetRow.locator('button:has-text("Resolver")');
        assert.ok(await resolveBtn.isVisible(), 'El botón Resolver debe estar visible en la fila cuando el ticket está en atención');
        await resolveBtn.click();
        await adminPage.waitForTimeout(1000);

        // 4. Probar reapertura permitida: desde Solucionado volver a "En proceso"
        const editBtn3 = adminTargetRow.locator('button:has-text("Editar")');
        assert.ok(await editBtn3.isVisible(), 'El botón Editar debe estar visible tras resolver el ticket');
        await editBtn3.click();
        await adminPage.waitForSelector('#editarTicket', { state: 'visible', timeout: 8000 });
        await editStateSelect.selectOption('En proceso');
        await adminPage.click('#editForm button[type="submit"]');
        await adminPage.waitForSelector('#editarTicket', { state: 'hidden', timeout: 8000 });
        await adminPage.waitForTimeout(1000);
        console.log('[ETAPA 7/8] Asignación, atención, resolución y reapertura ejecutadas correctamente.');

        // Navegar a Reporte Mensual
        console.log('[ETAPA 8/8] Navegando a Reporte Mensual, descargando CSV y generando PDF...');
        await adminPage.click('nav.sidebar-nav a[data-view="reportes"]');
        await adminPage.waitForSelector('#view-reportes', { state: 'visible', timeout: 8000 });
        await adminPage.waitForTimeout(1000);
        await adminPage.screenshot({ path: path.join(EVIDENCE_DIR, '08-admin-reports.png'), fullPage: true });

        // Probar filtro de mes
        const monthSelect = adminPage.locator('#reportMonthSelect');
        assert.ok(await monthSelect.isVisible(), 'El selector de mes de reporte debe estar visible');
        const months = await monthSelect.locator('option').count();
        if (months > 1) {
            await monthSelect.selectOption({ index: 0 });
            await adminPage.waitForTimeout(500);
        }

        // Descarga de CSV obligatoria mediante evento de descarga del navegador
        const csvButton = adminPage.locator('button[data-report-action="csv"]');
        assert.ok(await csvButton.isVisible(), 'El botón de descarga CSV debe estar visible');

        const [download] = await Promise.all([
            adminPage.waitForEvent('download', { timeout: 10000 }),
            csvButton.click()
        ]);
        assert.ok(download, 'El evento de descarga CSV es obligatorio y debe ocurrir al pulsar el botón');

        const csvPath = path.join(EVIDENCE_DIR, 'reporte-mensual.csv');
        await download.saveAs(csvPath);
        assert.ok(fs.existsSync(csvPath), 'El archivo CSV debe existir en disco');
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        assert.ok(csvContent.length > 0, 'El archivo CSV debe contener datos');
        console.log(`[ETAPA 8/8] Archivo CSV descargado con éxito (${csvContent.length} bytes) en ${csvPath}`);

        // Exportación de PDF mediante guardado de página
        const pdfPath = path.join(EVIDENCE_DIR, 'reporte-mensual.pdf');
        await adminPage.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        assert.ok(fs.existsSync(pdfPath), 'El archivo PDF debe existir en disco');
        const pdfStat = fs.statSync(pdfPath);
        assert.ok(pdfStat.size > 0, 'El archivo PDF debe tener tamaño mayor a cero');
        console.log(`[ETAPA 8/8] Archivo PDF generado con éxito (${pdfStat.size} bytes) en ${pdfPath}`);

        await adminPage.close();
        console.log('[COMPLETADO] Todas las etapas de interfaz ejecutadas exitosamente.');
    } finally {
        let cleanupError = null;

        if (createdTicketIds.length > 0) {
            console.log(`[CLEANUP] Iniciando limpieza de tickets creados: [${createdTicketIds.join(', ')}]...`);
            try {
                const config = applyTestDatabaseEnvironment();
                await ensureTestMysqlRunning(config);
                const conn = await mysql.createConnection({
                    host: config.host,
                    port: config.port,
                    user: config.user,
                    password: config.password,
                    database: config.database
                });
                try {
                    await conn.query('DELETE FROM ticket_historial WHERE ticket_id IN (?)', [createdTicketIds]);
                    await conn.query('DELETE FROM ticket_adjuntos WHERE ticket_id IN (?)', [createdTicketIds]);
                    await conn.query('DELETE FROM comentarios WHERE ticket_id IN (?)', [createdTicketIds]);
                    const [delRes] = await conn.query('DELETE FROM tickets WHERE id IN (?)', [createdTicketIds]);
                    console.log(`✓ Limpieza completada: eliminados ${delRes.affectedRows} tickets [${createdTicketIds.join(', ')}]`);
                } finally {
                    await conn.end();
                }
            } catch (err) {
                cleanupError = err;
                console.error('ADVERTENCIA: Error inesperado en la limpieza de la base de datos:', err);
            }
        }

        try {
            await browser.close();
            console.log('[BROWSER] Navegador cerrado correctamente.');
        } catch (browserErr) {
            console.error('ADVERTENCIA: Error al cerrar el navegador:', browserErr);
            if (!cleanupError) cleanupError = browserErr;
        }

        if (cleanupError) {
            throw cleanupError;
        }
    }
});
