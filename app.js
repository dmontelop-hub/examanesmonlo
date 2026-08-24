// --- CONFIGURACIÓN DE FIREBASE (Reemplaza con tus datos de Firebase) ---
const firebaseConfig = {
    apiKey: "AIzaSyD-REEMPLAZAR-CON-TU-APIKEY",
    authDomain: "evaluacion-escolar.firebaseapp.com",
    databaseURL: "https://evaluacion-escolar-default-rtdb.firebaseio.com",
    projectId: "evaluacion-escolar",
    storageBucket: "evaluacion-escolar.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
};

// Inicializar Firebase Realtime DB
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- ESTADO GLOBAL ---
let alumnoSesion = null;
let examenActivo = null;
let timerInterval = null;
let faltasCometidas = 0;
let listaExamenesLocal = [];
let listaResultadosLocal = [];

// --- NAVEGACIÓN Y VISTAS ---
function mostrarVista(vistaId) {
    const vistas = ['ingreso-alumno', 'lista-examenes', 'evaluacion', 'resultado-alumno', 'login-profesor', 'panel-profesor'];
    vistas.forEach(v => {
        const el = document.getElementById(`vista-${v}`);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(`vista-${vistaId}`).classList.remove('hidden');
}

// --- MÓDULO ALUMNO ---
function iniciarSesionAlumno(e) {
    e.preventDefault();
    alumnoSesion = {
        nombre: document.getElementById('alumno-nombre').value.trim(),
        colegio: document.getElementById('alumno-colegio').value,
        grado: document.getElementById('alumno-grado').value,
        seccion: document.getElementById('alumno-seccion').value.trim().toUpperCase()
    };

    document.getElementById('alumno-saludo').innerText = `Hola, ${alumnoSesion.nombre}`;
    document.getElementById('alumno-info-tag').innerText = `${alumnoSesion.colegio} | ${alumnoSesion.grado} ${alumnoSesion.seccion}`;

    mostrarVista('lista-examenes');
    cargarExamenesDisponibles();
}

function cerrarSesionAlumno() {
    alumnoSesion = null;
    mostrarVista('ingreso-alumno');
}

function cargarExamenesDisponibles() {
    const container = document.getElementById('contenedor-examenes-disponibles');
    container.innerHTML = '<p class="text-sm text-slate-500">Cargando exámenes...</p>';

    db.ref('examenes').on('value', (snapshot) => {
        const data = snapshot.val();
        container.innerHTML = '';
        if (!data) {
            container.innerHTML = '<p class="text-sm text-slate-500">No hay exámenes disponibles en este momento.</p>';
            return;
        }

        Object.keys(data).forEach(id => {
            const ex = data[id];
            // Filtrar por estado activo y asignación
            if (ex.estado === 'activo') {
                const matchColegio = ex.colegio === 'TODOS' || ex.colegio === alumnoSesion.colegio;
                const matchGrado = ex.grado === 'TODOS' || ex.grado === alumnoSesion.grado;
                const matchSeccion = !ex.seccion || ex.seccion === 'TODAS' || ex.seccion === alumnoSesion.seccion;

                if (matchColegio && matchGrado && matchSeccion) {
                    const card = document.createElement('div');
                    card.className = 'bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition';
                    card.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-slate-800">${ex.titulo}</h4>
                            <span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-bold">${ex.valor} Pts</span>
                        </div>
                        <p class="text-xs text-slate-500 mb-3"><i class="fa-solid fa-book mr-1"></i> Materia: ${ex.materia}</p>
                        <div class="flex justify-between items-center text-xs text-slate-400 border-t pt-3">
                            <span><i class="fa-regular fa-clock mr-1"></i> ${ex.tiempo} mins</span>
                            <button onclick="iniciarExamen('${id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded transition">
                                Iniciar Examen
                            </button>
                        </div>
                    `;
                    container.appendChild(card);
                }
            }
        });
    });
}

function iniciarExamen(examenId) {
    db.ref(`examenes/${examenId}`).once('value', (snapshot) => {
        examenActivo = snapshot.val();
        examenActivo.id = examenId;
        faltasCometidas = 0;

        document.getElementById('eval-titulo').innerText = examenActivo.titulo;
        document.getElementById('eval-materia').innerText = examenActivo.materia;
        document.getElementById('eval-valor').innerText = `Valor: ${examenActivo.valor} Puntos`;
        document.getElementById('eval-colegio').innerText = examenActivo.colegio;
        document.getElementById('eval-grado').innerText = `${examenActivo.grado} ${examenActivo.seccion}`;

        const logoImg = document.getElementById('eval-logo');
        if (examenActivo.logoUrl) {
            logoImg.src = examenActivo.logoUrl;
            logoImg.classList.remove('hidden');
        } else {
            logoImg.classList.add('hidden');
        }

        renderizarPreguntasExamen(examenActivo.series);
        iniciarTemporizador(examenActivo.tiempo * 60);
        activarSensorAntiTrampas();

        mostrarVista('evaluacion');
    });
}

function renderizarPreguntasExamen(series) {
    const container = document.getElementById('contenedor-series-alumno');
    container.innerHTML = '';

    series.forEach((s, sIdx) => {
        const serieDiv = document.createElement('div');
        serieDiv.className = 'bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-4';
        
        let html = `<div class="border-b pb-2 mb-4">
            <h4 class="font-bold text-blue-900">${s.nombre} (${s.totalSerie} Pts)</h4>
            <p class="text-xs text-slate-500">${s.instrucciones}</p>
        </div><div class="space-y-4">`;

        s.preguntas.forEach((p, pIdx) => {
            html += `<div class="p-3 bg-slate-50 rounded-lg border">
                <p class="font-semibold text-sm mb-2">${pIdx + 1}. ${p.enunciado} <span class="text-xs text-blue-600">(${p.puntos} pt)</span></p>`;

            if (p.tipo === 'directa') {
                html += `<input type="text" name="res_${sIdx}_${pIdx}" placeholder="Escribe tu respuesta..." class="w-full px-3 py-1.5 border rounded text-sm bg-white">`;
            } else if (p.tipo === 'vf') {
                html += `<div class="flex gap-4 text-sm">
                    <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="res_${sIdx}_${pIdx}" value="Verdadero"> Verdadero</label>
                    <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="res_${sIdx}_${pIdx}" value="Falso"> Falso</label>
                </div>`;
            } else if (p.tipo === 'seleccion') {
                p.opciones.forEach(op => {
                    html += `<label class="block text-sm mb-1 cursor-pointer"><input type="radio" name="res_${sIdx}_${pIdx}" value="${op}"> ${op}</label>`;
                });
            }

            html += `</div>`;
        });

        html += `</div>`;
        serieDiv.innerHTML = html;
        container.appendChild(serieDiv);
    });
}

// --- CONTROL DE TEMPORIZADOR Y ANTI-TRAMPAS ---
function iniciarTemporizador(segundosTotales) {
    let t = segundosTotales;
    const timerDisplay = document.getElementById('eval-timer');

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const mins = Math.floor(t / 60);
        const secs = t % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (t <= 0) {
            clearInterval(timerInterval);
            alert("¡Tiempo agotado! Tu examen será enviado automáticamente.");
            procesarYEnviarExamen(true);
        }
        t--;
    }, 1000);
}

function activarSensorAntiTrampas() {
    window.onblur = () => registrarFalta("Cambio de pestaña / ventana");
    document.onvisibilitychange = () => {
        if (document.hidden) registrarFalta("Minimizar pantalla");
    };
}

function desactivarSensorAntiTrampas() {
    window.onblur = null;
    document.onvisibilitychange = null;
    clearInterval(timerInterval);
}

function registrarFalta(motivo) {
    if (!examenActivo) return;

    faltasCometidas++;
    document.getElementById('falta-contador').innerText = faltasCometidas;
    document.getElementById('modal-falta').classList.remove('hidden');

    if (faltasCometidas >= 3) {
        desactivarSensorAntiTrampas();
        alert("¡Examen Anulado! Has acumulado 3 faltas de seguridad por intento de trampa.");
        procesarYEnviarExamen(true, true);
    }
}

function cerrarModalFalta() {
    document.getElementById('modal-falta').classList.add('hidden');
}

// --- EVALUACIÓN Y CALIFICACIÓN AUTOMÁTICA ---
function finalizarExamenManual(e) {
    e.preventDefault();
    if (confirm("¿Estás seguro de finalizar y enviar tu examen?")) {
        desactivarSensorAntiTrampas();
        procesarYEnviarExamen(false);
    }
}

function procesarYEnviarExamen(porTiempoOFalta = false, anulado = false) {
    let notaObtenida = 0;
    const desglose = [];

    if (!anulado) {
        examenActivo.series.forEach((s, sIdx) => {
            s.preguntas.forEach((p, pIdx) => {
                let respuestaAlumno = "";
                if (p.tipo === 'directa') {
                    const input = document.querySelector(`input[name="res_${sIdx}_${pIdx}"]`);
                    respuestaAlumno = input ? input.value.trim() : "";
                } else {
                    const checked = document.querySelector(`input[name="res_${sIdx}_${pIdx}"]:checked`);
                    respuestaAlumno = checked ? checked.value : "";
                }

                let esCorrecta = false;

                if (p.tipo === 'directa') {
                    const resLimpia = respuestaAlumno.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (p.keywords && p.keywords.length > 0) {
                        // Verifica si contiene las palabras clave requeridas
                        esCorrecta = p.keywords.some(kw => resLimpia.includes(kw.toLowerCase().trim()));
                    } else if (p.respuestaCorrecta) {
                        const correctaLimpia = p.respuestaCorrecta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        esCorrecta = resLimpia === correctaLimpia;
                    }
                } else {
                    esCorrecta = respuestaAlumno === p.respuestaCorrecta;
                }

                if (esCorrecta) notaObtenida += parseFloat(p.puntos);

                desglose.push({
                    pregunta: p.enunciado,
                    respuestaAlumno: respuestaAlumno || "(Sin respuesta)",
                    respuestaEsperada: p.respuestaCorrecta || p.keywords.join(", "),
                    esCorrecta: esCorrecta,
                    puntos: esCorrecta ? p.puntos : 0
                });
            });
        });
    }

    const resultadoObj = {
        examenId: examenActivo.id,
        examenTitulo: examenActivo.titulo,
        alumno: alumnoSesion,
        notaObtenida: notaObtenida,
        notaTotal: examenActivo.valor,
        faltas: faltasCometidas,
        anulado: anulado,
        fecha: new Date().toLocaleString(),
        desglose: desglose
    };

    // Guardar en Firebase
    db.ref('resultados').push(resultadoObj, (err) => {
        mostrarResultadoAlumno(resultadoObj);
    });
}

function mostrarResultadoAlumno(res) {
    mostrarVista('resultado-alumno');

    document.getElementById('res-alumno-nombre').innerText = `${res.alumno.nombre} (${res.alumno.colegio})`;
    document.getElementById('res-punteo').innerText = `${res.notaObtenida} / ${res.notaTotal}`;
    const porc = Math.round((res.notaObtenida / res.notaTotal) * 100);
    document.getElementById('res-porcentaje').innerText = `${porc}% de acierto`;

    const iconDiv = document.getElementById('res-icon');
    if (res.anulado) {
        iconDiv.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-600"></i>`;
    } else {
        iconDiv.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-500"></i>`;
    }

    if (res.faltas > 0) {
        document.getElementById('res-faltas-box').classList.remove('hidden');
        document.getElementById('res-total-faltas').innerText = res.faltas;
    } else {
        document.getElementById('res-faltas-box').classList.add('hidden');
    }

    const container = document.getElementById('res-desglose');
    container.innerHTML = '';

    res.desglose.forEach(d => {
        const item = document.createElement('div');
        item.className = `p-3 rounded-lg border ${d.esCorrecta ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`;
        item.innerHTML = `
            <p class="font-bold">${d.pregunta}</p>
            <p class="text-xs">Tu respuesta: ${d.respuestaAlumno}</p>
            ${!d.esCorrecta ? `<p class="text-xs font-semibold">Respuesta correcta esperada: ${d.respuestaEsperada}</p>` : ''}
        `;
        container.appendChild(item);
    });
}

// --- MÓDULO PROFESOR ---
function autenticarProfesor() {
    const pass = document.getElementById('profesor-pass').value;
    if (pass === 'admin123') { // Clave predeterminada
        mostrarVista('panel-profesor');
        cargarPanelExamenes();
        cargarPanelResultados();
    } else {
        alert("Contraseña incorrecta");
    }
}

function cerrarSesionProfesor() {
    mostrarVista('ingreso-alumno');
}

function cambiarTabProfesor(tab) {
    if (tab === 'examenes') {
        document.getElementById('subtab-examenes').classList.remove('hidden');
        document.getElementById('subtab-resultados').classList.add('hidden');
        document.getElementById('tab-examenes').className = "py-2 px-4 font-bold text-sm border-b-2 border-blue-600 text-blue-600";
        document.getElementById('tab-resultados').className = "py-2 px-4 font-bold text-sm text-slate-500";
    } else {
        document.getElementById('subtab-examenes').classList.add('hidden');
        document.getElementById('subtab-resultados').classList.remove('hidden');
        document.getElementById('tab-examenes').className = "py-2 px-4 font-bold text-sm text-slate-500";
        document.getElementById('tab-resultados').className = "py-2 px-4 font-bold text-sm border-b-2 border-blue-600 text-blue-600";
    }
}

// Cargar Exámenes en Panel Profesor
function cargarPanelExamenes() {
    db.ref('examenes').on('value', snapshot => {
        const data = snapshot.val() || {};
        listaExamenesLocal = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        renderTablaExamenes(listaExamenesLocal);
    });
}

function renderTablaExamenes(list) {
    const container = document.getElementById('tabla-examenes-contenedor');
    let html = `<table class="w-full text-left text-xs text-slate-600">
        <thead class="bg-slate-50 text-slate-700 uppercase font-bold border-b">
            <tr>
                <th class="p-3">Título</th>
                <th class="p-3">Materia</th>
                <th class="p-3">Asignación</th>
                <th class="p-3">Estado</th>
                <th class="p-3 text-right">Acciones</th>
            </tr>
        </thead><tbody>`;

    list.forEach(ex => {
        html += `<tr class="border-b hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-800">${ex.titulo}</td>
            <td class="p-3">${ex.materia}</td>
            <td class="p-3">${ex.colegio} | ${ex.grado} ${ex.seccion || ''}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${ex.estado === 'activo' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                    ${ex.estado.toUpperCase()}
                </span>
            </td>
            <td class="p-3 text-right space-x-2">
                <button onclick="cambiarEstadoExamen('${ex.id}', '${ex.estado}')" class="text-blue-600 hover:text-blue-800" title="Activar/Desactivar">
                    <i class="fa-solid fa-power-off"></i>
                </button>
                <button onclick="eliminarExamen('${ex.id}')" class="text-red-600 hover:text-red-800" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function cambiarEstadoExamen(id, estadoActual) {
    const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
    db.ref(`examenes/${id}`).update({ estado: nuevoEstado });
}

function eliminarExamen(id) {
    if (confirm("¿Deseas eliminar este examen permanentemente?")) {
        db.ref(`examenes/${id}`).remove();
    }
}

// Cargar Resultados Alumnos en Panel Profesor
function cargarPanelResultados() {
    db.ref('resultados').on('value', snapshot => {
        const data = snapshot.val() || {};
        listaResultadosLocal = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        renderTablaResultados(listaResultadosLocal);
    });
}

function renderTablaResultados(list) {
    const container = document.getElementById('tabla-resultados-contenedor');
    let html = `<table class="w-full text-left text-xs text-slate-600">
        <thead class="bg-slate-50 text-slate-700 uppercase font-bold border-b">
            <tr>
                <th class="p-3">Alumno</th>
                <th class="p-3">Colegio / Grado</th>
                <th class="p-3">Examen</th>
                <th class="p-3">Nota</th>
                <th class="p-3">Faltas</th>
                <th class="p-3">Fecha</th>
            </tr>
        </thead><tbody>`;

    list.forEach(r => {
        html += `<tr class="border-b hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-800">${r.alumno.nombre}</td>
            <td class="p-3">${r.alumno.colegio} (${r.alumno.grado} ${r.alumno.seccion})</td>
            <td class="p-3">${r.examenTitulo}</td>
            <td class="p-3 font-bold ${r.anulado ? 'text-red-600' : 'text-blue-600'}">${r.notaObtenida} / ${r.notaTotal}</td>
            <td class="p-3">${r.faltas > 0 ? `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">${r.faltas} Faltas</span>` : '0'}</td>
            <td class="p-3 text-slate-400">${r.fecha}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// CREADOR DE EXÁMENES
function abrirCreadorExamen() {
    document.getElementById('vista-creador-examen').classList.remove('hidden');
    document.getElementById('contenedor-series-creador').innerHTML = '';
    agregarSerieCreador();
}

function cerrarCreadorExamen() {
    document.getElementById('vista-creador-examen').classList.add('hidden');
}

function agregarSerieCreador() {
    const container = document.getElementById('contenedor-series-creador');
    const index = container.children.length;

    const div = document.createElement('div');
    div.className = 'p-4 border rounded-lg bg-slate-50 space-y-3';
    div.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" placeholder="Nombre Serie (Ej: Serie I)" class="serie-nombre px-3 py-1.5 border rounded text-sm bg-white" required>
            <input type="text" placeholder="Instrucciones" class="serie-instrucciones px-3 py-1.5 border rounded text-sm bg-white md:col-span-2" required>
        </div>
        <div class="flex justify-between items-center">
            <h5 class="text-xs font-bold text-slate-700">Preguntas de la Serie</h5>
            <button type="button" onclick="agregarPreguntaCreador(this)" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">
                + Agregar Pregunta
            </button>
        </div>
        <div class="serie-preguntas-box space-y-2"></div>
    `;
    container.appendChild(div);
}

function agregarPreguntaCreador(btn) {
    const box = btn.parentElement.nextElementSibling;
    const pDiv = document.createElement('div');
    pDiv.className = 'p-3 bg-white border rounded space-y-2';
    pDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input type="text" placeholder="Enunciado de la pregunta" class="p-enunciado px-2 py-1 border rounded text-xs md:col-span-2" required>
            <select onchange="cambiarTipoPregunta(this)" class="p-tipo px-2 py-1 border rounded text-xs">
                <option value="directa">Pregunta Directa</option>
                <option value="vf">Falso / Verdadero</option>
                <option value="seleccion">Opción Múltiple</option>
            </select>
            <input type="number" placeholder="Puntos" value="1" class="p-puntos px-2 py-1 border rounded text-xs" required>
        </div>
        <div class="p-respuestas-config">
            <input type="text" placeholder="Palabras clave separadas por coma (ej: hardware, ram)" class="p-resp-directa px-2 py-1 border rounded text-xs w-full">
        </div>
    `;
    box.appendChild(pDiv);
}

function cambiarTipoPregunta(select) {
    const configDiv = select.parentElement.nextElementSibling;
    const tipo = select.value;

    if (tipo === 'directa') {
        configDiv.innerHTML = `<input type="text" placeholder="Palabras clave separadas por coma (ej: cpu, procesador)" class="p-resp-directa px-2 py-1 border rounded text-xs w-full">`;
    } else if (tipo === 'vf') {
        configDiv.innerHTML = `<select class="p-resp-vf px-2 py-1 border rounded text-xs w-full">
            <option value="Verdadero">Respuesta Correcta: Verdadero</option>
            <option value="Falso">Respuesta Correcta: Falso</option>
        </select>`;
    } else if (tipo === 'seleccion') {
        configDiv.innerHTML = `<input type="text" placeholder="Opciones separadas por coma (ej: CPU, RAM, Mouse)" class="p-opciones px-2 py-1 border rounded text-xs w-full mb-1">
        <input type="text" placeholder="Respuesta exacta correcta" class="p-resp-correcta px-2 py-1 border rounded text-xs w-full">`;
    }
}

function guardarExamenDB(e) {
    e.preventDefault();

    const series = [];
    const seriesBlocks = document.querySelectorAll('#contenedor-series-creador > div');

    seriesBlocks.forEach(sDiv => {
        const nombre = sDiv.querySelector('.serie-nombre').value;
        const instrucciones = sDiv.querySelector('.serie-instrucciones').value;
        const preguntas = [];
        let totalSerie = 0;

        const pBlocks = sDiv.querySelectorAll('.serie-preguntas-box > div');
        pBlocks.forEach(pDiv => {
            const enunciado = pDiv.querySelector('.p-enunciado').value;
            const tipo = pDiv.querySelector('.p-tipo').value;
            const puntos = parseFloat(pDiv.querySelector('.p-puntos').value);
            totalSerie += puntos;

            let respuestaCorrecta = "";
            let keywords = [];
            let opciones = [];

            if (tipo === 'directa') {
                const kwStr = pDiv.querySelector('.p-resp-directa').value;
                keywords = kwStr.split(',').map(s => s.trim());
            } else if (tipo === 'vf') {
                respuestaCorrecta = pDiv.querySelector('.p-resp-vf').value;
            } else if (tipo === 'seleccion') {
                const opStr = pDiv.querySelector('.p-opciones').value;
                oppciones = opStr.split(',').map(s => s.trim());
                respuestaCorrecta = pDiv.querySelector('.p-resp-correcta').value.trim();
            }

            preguntas.push({
                enunciado, tipo, puntos, respuestaCorrecta, keywords, opciones
            });
        });

        series.push({ nombre, instrucciones, totalSerie, preguntas });
    });

    const examenObj = {
        titulo: document.getElementById('ex-titulo').value,
        materia: document.getElementById('ex-materia').value,
        colegio: document.getElementById('ex-colegio').value,
        grado: document.getElementById('ex-grado').value,
        seccion: document.getElementById('ex-seccion').value.toUpperCase(),
        tiempo: parseInt(document.getElementById('ex-tiempo').value),
        valor: parseFloat(document.getElementById('ex-valor').value),
        logoUrl: document.getElementById('ex-logo').value,
        estado: 'activo',
        series: series
    };

    db.ref('examenes').push(examenObj, () => {
        cerrarCreadorExamen();
        alert("¡Examen guardado exitosamente!");
    });
}

// IMPRESIÓN Y EXPORTACIÓN PDF
function generarReportePDFGeneral() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Reporte General de Evaluaciones", 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 14, 22);

    const rows = listaResultadosLocal.map(r => [
        r.alumno.nombre,
        `${r.alumno.colegio} (${r.alumno.grado} ${r.alumno.seccion})`,
        r.examenTitulo,
        `${r.notaObtenida} / ${r.notaTotal}`,
        r.faltas,
        r.fecha
    ]);

    doc.autoTable({
        startY: 28,
        head: [['Alumno', 'Colegio/Grado', 'Examen', 'Punteo', 'Faltas', 'Fecha']],
        body: rows,
        theme: 'striped'
    });

    doc.save("Reporte_General_Notas.pdf");
}

function exportarRespaldoJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        examenes: listaExamenesLocal,
        resultados: listaResultadosLocal
    }));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "respaldo_evaluaciones.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// INICIALIZACIÓN POR DEFECTO
mostrarVista('ingreso-alumno');