(function exposeModalAcceso(global) {
    const OFFICIAL_PLATFORMS = [
        { nombre: 'Google Classroom', etiqueta: 'Google Classroom' },
        { nombre: 'ERP University UTEA', etiqueta: 'ERP University UTEA' },
        { nombre: 'Gmail Institucional', etiqueta: 'Correo institucional' },
        { nombre: 'No cuento con un correo institucional', etiqueta: 'No cuento con un correo institucional' },
        { nombre: 'Otro', etiqueta: 'Otro' }
    ];
    const REPORTS_BY_PLATFORM = {
        'Google Classroom': [
            '1. No hay acceso al Classroom',
            '2. Actualización de asignaturas Classroom',
            '3. Asignaturas faltantes en Classroom',
            '4. Eliminar asignaturas antiguas de Classroom',
            '5. Actualización de cambio de grupo Classroom'
        ],
        'ERP University UTEA': [
            '6. No hay acceso al ERP University UTEA',
            '7. Recuperación de cuenta ERP University UTEA',
            '8. Recuperación de contraseña ERP University UTEA',
            '9. Problema con asignaturas en ERP University UTEA',
            '14. Justificación de inasistencia'
        ],
        'Gmail Institucional': [
            '10. Pérdida de cuenta institucional',
            '11. Recuperación de cuenta correo y contraseña',
            '12. Creación de cuenta correo institucional',
            '13. Borrar almacenamiento de correo institucional',
            '15. Solicito la creación de un correo institucional'
        ],
        'No cuento con un correo institucional': [
            '15. Solicito la creación de un correo institucional',
            '16. Otro'
        ],
        'Otro': ['16. Otro']
    };
    const OFFICIAL_FACULTIES = [
        {
            nombre: 'Facultad de Ingeniería',
            programas: 'Agronomía, Civil, Ambiental y Sistemas'
        },
        {
            nombre: 'Facultad de Ciencias Jurídicas, Contables y Sociales',
            programas: 'Derecho, Contabilidad y Educación'
        },
        {
            nombre: 'Facultad de Ciencias de la Salud',
            programas: 'Enfermería'
        }
    ];

    function renderSelect(select, items, placeholder, getLabel = item => item.nombre) {
        select.replaceChildren(new Option(placeholder, ''));
        items.forEach(item => {
            const option = new Option(getLabel(item), item.id ?? item.nombre);
            if (item.nombre) option.dataset.platformName = item.nombre;
            select.add(option);
        });
        select.disabled = false;
        select.removeAttribute('disabled');
    }

    function updateProblemTypes() {
        const platformSelect = document.getElementById('accountPlatform');
        const problemSelect = document.getElementById('accountProblemType');
        if (!platformSelect || !problemSelect) return;

        const platformName = platformSelect.selectedOptions[0]?.dataset.platformName || '';
        const reports = REPORTS_BY_PLATFORM[platformName] || [];
        problemSelect.replaceChildren(new Option(
            reports.length ? 'Selecciona un tipo de reporte...' : 'Primero selecciona una plataforma...',
            ''
        ));
        reports.forEach(report => problemSelect.add(new Option(report, report)));
        problemSelect.disabled = reports.length === 0;
    }

    async function loadCatalogs() {
        const platformSelect = document.getElementById('accountPlatform');
        const facultySelect = document.getElementById('facultad');
        if (!platformSelect || !facultySelect) return;

        platformSelect.disabled = true;
        platformSelect.replaceChildren(new Option('Cargando plataformas...', ''));
        const problemSelect = document.getElementById('accountProblemType');
        if (problemSelect) {
            problemSelect.replaceChildren(new Option('Primero selecciona una plataforma...', ''));
            problemSelect.disabled = true;
        }
        facultySelect.disabled = true;
        facultySelect.replaceChildren(new Option('Cargando facultades...', ''));

        await Promise.all([
            (async () => {
                try {
                    const platforms = await global.CuentasApi.getPlataformas();
                    if (!Array.isArray(platforms)) throw new Error('La respuesta de plataformas no es una lista');
                    const byName = new Map(platforms.map(platform => [platform.nombre, platform]));
                    const officialPlatforms = OFFICIAL_PLATFORMS
                        .map(item => ({ ...byName.get(item.nombre), etiqueta: item.etiqueta }))
                        .filter(item => item.id);
                    renderSelect(platformSelect, officialPlatforms, 'Selecciona una plataforma...', item => item.etiqueta);
                    if (!officialPlatforms.length) {
                        platformSelect.replaceChildren(new Option('No hay plataformas oficiales disponibles', ''));
                    }
                    updateProblemTypes();
                } catch (error) {
                    console.error('No se pudieron cargar las plataformas institucionales:', error);
                    platformSelect.replaceChildren(new Option('No se pudieron cargar las plataformas', ''));
                    platformSelect.disabled = false;
                    platformSelect.removeAttribute('disabled');
                }
            })(),
            (async () => {
                try {
                    const faculties = await global.CuentasApi.getFacultades();
                    if (!Array.isArray(faculties)) throw new Error('La respuesta de facultades no es una lista');
                    const officialFaculties = OFFICIAL_FACULTIES.filter(official =>
                        faculties.some(faculty => faculty.nombre === official.nombre)
                    );
                    renderSelect(facultySelect, officialFaculties, 'Selecciona una facultad...');
                } catch (error) {
                    console.error('No se pudieron cargar las facultades institucionales:', error);
                    renderSelect(facultySelect, OFFICIAL_FACULTIES, 'Selecciona una facultad...');
                }
            })()
        ]);
    }

    function initialize() {
        const typeSelect = document.getElementById('ticketType');
        const openButton = document.getElementById('quickTicketOpen');
        if (!typeSelect) return;

        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'cuenta') loadCatalogs();
        });
        openButton?.addEventListener('click', () => {
            if (typeSelect.value === 'cuenta') loadCatalogs();
        });

        const facultySelect = document.getElementById('facultad');
        const programs = document.getElementById('accountFacultyPrograms');
        const platformSelect = document.getElementById('accountPlatform');
        const accountForm = document.getElementById('accountTicketForm');
        platformSelect?.addEventListener('change', updateProblemTypes);
        accountForm?.addEventListener('reset', () => queueMicrotask(updateProblemTypes));
        facultySelect?.addEventListener('change', () => {
            const faculty = OFFICIAL_FACULTIES.find(item => item.nombre === facultySelect.value);
            if (programs) {
                programs.textContent = faculty ? `Programas: ${faculty.programas}` : 'Selecciona tu facultad.';
            }
        });
    }

    global.ModalAcceso = Object.freeze({ initialize, loadCatalogs });
})(window);
