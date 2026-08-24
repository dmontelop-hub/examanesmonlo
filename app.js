/* ============================================================================
   EduControl — Lógica de la aplicación
   ============================================================================ */

// ---------------------------------------------------------------------------
// ESTADO GLOBAL
// ---------------------------------------------------------------------------
let db = null;
let colegios = [];
let grados = [];
let alumnos = [];
let examenes = [];
let resultados = [];

let alumnoSesion = null;
let examenActivo = null;
let timerInterval = null;
let faltasCometidas = 0;
let contadorPreguntasCreador = 0;

const CFG_KEY = 'ec_firebaseConfig';
const PASS_KEY = 'ec_adminPassword';

// ---------------------------------------------------------------------------
// ARRANQUE
// ---------------------------------------------------------------------------
(function iniciar() {
  const guardada = localStorage.getItem(CFG_KEY);
  if (!guardada) {
    mostrarVista('setup');
    return;
  }
  try {
    const cfg = JSON.parse(guardada);
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    document.getElementById('home-db-estado').innerText = `conectado a "${cfg.projectId}"`;
    document.getElementById('config-project-id').innerText = cfg.projectId;
    suscribirColegios();
    suscribirGrados();
    mostrarVista('home');
  } catch (e) {
    console.error('Error inicializando Firebase:', e);
    alert('No se pudo conectar con la base de datos configurada. Verifica los datos.');
    mostrarVista('setup');
  }
})();

document.getElementById('form-setup').addEventListener('submit', (e) => {
  e.preventDefault();
  const cfg = {
    apiKey: document.getElementById('cfg-apiKey').value.trim(),
    authDomain: document.getElementById('cfg-authDomain').value.trim(),
    projectId: document.getElementById('cfg-projectId').value.trim(),
    storageBucket: document.getElementById('cfg-storageBucket').value.trim(),
    messagingSenderId: document.getElementById('cfg-messagingSenderId').value.trim(),
    appId: document.getElementById('cfg-appId').value.trim()
  };
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  location.reload();
});

function toggleAyudaSetup() {
  document.getElementById('ayuda-setup').classList.toggle('hidden');
}

// ---------------------------------------------------------------------------
// NAVEGACIÓN DE VISTAS
// ---------------------------------------------------------------------------
function mostrarVista(id) {
  const vistas = ['setup', 'home', 'admin-login', 'alumno-ingreso', 'lista-examenes',
                  'evaluacion', 'resultado-alumno', 'panel-admin'];
  vistas.forEach(v => document.getElementById(`vista-${v}`)?.classList.add('hidden'));
  document.getElementById(`vista-${id}`)?.classList.remove('hidden');

  if (id === 'alumno-ingreso') {
    poblarSelect(document.getElementById('alumno-colegio'), colegios, 'Seleccione colegio...');
    document.getElementById('alumno-grado').innerHTML = '<option value="">Seleccione grado y sección...</option>';
  }
}

document.getElementById('alumno-colegio')?.addEventListener('change', (e) => {
  const sel = document.getElementById('alumno-grado');
  poblarSelectGrados(sel, e.target.value, false);
});

// ---------------------------------------------------------------------------
// HELPERS GENERALES
// ---------------------------------------------------------------------------
function poblarSelect(select, items, placeholder) {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(it => select.innerHTML += `<option value="${it.id}">${it.nombre}</option>`);
}

function poblarSelectGrados(select, colegioId, incluirTodos) {
  if (!select) return;
  select.innerHTML = incluirTodos ? '<option value="TODOS">Todos los grados/secciones</option>' : '<option value="">Seleccione grado y sección...</option>';
  grados.filter(g => g.colegioId === colegioId).forEach(g => {
    select.innerHTML += `<option value="${g.id}">${g.nombre} - Sección ${g.seccion}</option>`;
  });
}

function nombreColegio(id) { return colegios.find(c => c.id === id)?.nombre || 'Colegio eliminado'; }
function nombreGrado(id) {
  const g = grados.find(x => x.id === id);
  return g ? `${g.nombre} - Sección ${g.seccion}` : 'Grado eliminado';
}
function fmtFecha(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// ---------------------------------------------------------------------------
// SUSCRIPCIONES EN TIEMPO REAL (Firestore)
// ---------------------------------------------------------------------------
function suscribirColegios() {
  db.collection('colegios').onSnapshot(snap => {
    colegios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderColegios();
    poblarSelect(document.getElementById('graColegioSelect'), colegios, 'Seleccione colegio...');
    poblarSelect(document.getElementById('alColegioSelect'), colegios, 'Seleccione colegio...');
    poblarSelectConTodos(document.getElementById('ex-colegio'), colegios);
    poblarFiltroColegios();
  });
}

function suscribirGrados() {
  db.collection('grados').onSnapshot(snap => {
    grados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGrados();
  });
}

function suscribirAlumnos() {
  db.collection('alumnos').onSnapshot(snap => {
    alumnos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAlumnos();
  });
}

function suscribirExamenes() {
  db.collection('examenes').onSnapshot(snap => {
    examenes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaExamenes();
  });
}

function suscribirResultados() {
  db.collection('resultados').onSnapshot(snap => {
    resultados = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    renderResultados();
  });
}

// ============================================================================
// MÓDULO: COLEGIOS
// ============================================================================
function renderColegios() {
  const filtro = (document.getElementById('searchColegio')?.value || '').toLowerCase();
  const tbody = document.getElementById('tblColegios');
  if (!tbody) return;
  tbody.innerHTML = '';
  colegios.filter(c => c.nombre.toLowerCase().includes(filtro)).forEach(c => {
    tbody.innerHTML += `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-semibold">${c.nombre}</td>
        <td class="p-3 text-slate-500">${c.direccion || '-'}</td>
        <td class="p-3 text-slate-500">${c.telefono || '-'}</td>
        <td class="p-3 text-right space-x-2">
          <button onclick="editColegio('${c.id}')" class="text-[var(--brand-600)]"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteColegio('${c.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
  if (colegios.length === 0) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Aún no hay colegios registrados.</td></tr>`;
}

function openColegioModal() {
  document.getElementById('colId').value = '';
  document.getElementById('colNombre').value = '';
  document.getElementById('colDireccion').value = '';
  document.getElementById('colTelefono').value = '';
  document.getElementById('titleModalColegio').innerText = 'Agregar colegio';
  openModal('modal-colegio');
}

function editColegio(id) {
  const c = colegios.find(x => x.id === id);
  if (!c) return;
  document.getElementById('colId').value = c.id;
  document.getElementById('colNombre').value = c.nombre;
  document.getElementById('colDireccion').value = c.direccion || '';
  document.getElementById('colTelefono').value = c.telefono || '';
  document.getElementById('titleModalColegio').innerText = 'Editar colegio';
  openModal('modal-colegio');
}

async function guardarColegio() {
  const id = document.getElementById('colId').value;
  const data = {
    nombre: document.getElementById('colNombre').value.trim(),
    direccion: document.getElementById('colDireccion').value.trim(),
    telefono: document.getElementById('colTelefono').value.trim()
  };
  if (!data.nombre) return alert('El nombre del colegio es obligatorio.');
  if (id) await db.collection('colegios').doc(id).update(data);
  else await db.collection('colegios').add(data);
  closeModal('modal-colegio');
}

async function deleteColegio(id) {
  const tieneGrados = grados.some(g => g.colegioId === id);
  if (tieneGrados && !confirm('Este colegio tiene grados/secciones asociados. ¿Eliminarlo de todos modos?')) return;
  if (!tieneGrados && !confirm('¿Deseas eliminar este colegio?')) return;
  await db.collection('colegios').doc(id).delete();
}

// ============================================================================
// MÓDULO: GRADOS Y SECCIONES
// ============================================================================
function renderGrados() {
  const filtro = (document.getElementById('searchGrado')?.value || '').toLowerCase();
  const tbody = document.getElementById('tblGrados');
  if (!tbody) return;
  tbody.innerHTML = '';
  grados.filter(g => {
    const colNom = nombreColegio(g.colegioId).toLowerCase();
    return g.nombre.toLowerCase().includes(filtro) || colNom.includes(filtro);
  }).forEach(g => {
    tbody.innerHTML += `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3">${nombreColegio(g.colegioId)}</td>
        <td class="p-3 font-semibold">${g.nombre}</td>
        <td class="p-3"><span class="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">${g.seccion}</span></td>
        <td class="p-3 text-right space-x-2">
          <button onclick="editGrado('${g.id}')" class="text-[var(--brand-600)]"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteGrado('${g.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
  if (grados.length === 0) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Aún no hay grados registrados.</td></tr>`;
}

function openGradoModal() {
  if (colegios.length === 0) return alert('Primero registra al menos un colegio.');
  document.getElementById('graId').value = '';
  document.getElementById('graColegioSelect').value = '';
  document.getElementById('graNombre').value = '';
  document.getElementById('graSeccion').value = '';
  document.getElementById('titleModalGrado').innerText = 'Agregar grado';
  openModal('modal-grado');
}

function editGrado(id) {
  const g = grados.find(x => x.id === id);
  if (!g) return;
  document.getElementById('graId').value = g.id;
  document.getElementById('graColegioSelect').value = g.colegioId;
  document.getElementById('graNombre').value = g.nombre;
  document.getElementById('graSeccion').value = g.seccion;
  document.getElementById('titleModalGrado').innerText = 'Editar grado';
  openModal('modal-grado');
}

async function guardarGrado() {
  const id = document.getElementById('graId').value;
  const data = {
    colegioId: document.getElementById('graColegioSelect').value,
    nombre: document.getElementById('graNombre').value.trim(),
    seccion: document.getElementById('graSeccion').value.trim().toUpperCase()
  };
  if (!data.colegioId || !data.nombre || !data.seccion) return alert('Todos los campos son obligatorios.');
  if (id) await db.collection('grados').doc(id).update(data);
  else await db.collection('grados').add(data);
  closeModal('modal-grado');
}

async function deleteGrado(id) {
  if (!confirm('¿Deseas eliminar este grado/sección?')) return;
  await db.collection('grados').doc(id).delete();
}

// ============================================================================
// MÓDULO: ALUMNOS
// ============================================================================
function renderAlumnos() {
  const filtro = (document.getElementById('searchAlumno')?.value || '').toLowerCase();
  const tbody = document.getElementById('tblAlumnos');
  if (!tbody) return;
  tbody.innerHTML = '';
  alumnos.filter(a => {
    const texto = `${a.nombre} ${nombreColegio(a.colegioId)} ${nombreGrado(a.gradoId)}`.toLowerCase();
    return texto.includes(filtro);
  }).forEach(a => {
    tbody.innerHTML += `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-semibold">${a.nombre}${a.codigo ? ` <span class="text-xs text-slate-400">(${a.codigo})</span>` : ''}</td>
        <td class="p-3">${nombreColegio(a.colegioId)}</td>
        <td class="p-3">${nombreGrado(a.gradoId)}</td>
        <td class="p-3 text-right space-x-2">
          <button onclick="editAlumno('${a.id}')" class="text-[var(--brand-600)]"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteAlumno('${a.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
  if (alumnos.length === 0) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Aún no hay alumnos registrados.</td></tr>`;
}

function openAlumnoModal() {
  if (colegios.length === 0) return alert('Primero registra al menos un colegio y un grado.');
  document.getElementById('alId').value = '';
  document.getElementById('alNombre').value = '';
  document.getElementById('alCodigo').value = '';
  poblarSelect(document.getElementById('alColegioSelect'), colegios, 'Seleccione colegio...');
  document.getElementById('alGradoSelect').innerHTML = '<option value="">Seleccione grado y sección...</option>';
  document.getElementById('titleModalAlumno').innerText = 'Agregar alumno';
  openModal('modal-alumno');
}

function actualizarGradosDeAlumnoModal() {
  const colegioId = document.getElementById('alColegioSelect').value;
  poblarSelectGrados(document.getElementById('alGradoSelect'), colegioId, false);
}

function editAlumno(id) {
  const a = alumnos.find(x => x.id === id);
  if (!a) return;
  document.getElementById('alId').value = a.id;
  document.getElementById('alNombre').value = a.nombre;
  document.getElementById('alCodigo').value = a.codigo || '';
  poblarSelect(document.getElementById('alColegioSelect'), colegios, 'Seleccione colegio...');
  document.getElementById('alColegioSelect').value = a.colegioId;
  poblarSelectGrados(document.getElementById('alGradoSelect'), a.colegioId, false);
  document.getElementById('alGradoSelect').value = a.gradoId;
  document.getElementById('titleModalAlumno').innerText = 'Editar alumno';
  openModal('modal-alumno');
}

async function guardarAlumno() {
  const id = document.getElementById('alId').value;
  const data = {
    nombre: document.getElementById('alNombre').value.trim(),
    colegioId: document.getElementById('alColegioSelect').value,
    gradoId: document.getElementById('alGradoSelect').value,
    codigo: document.getElementById('alCodigo').value.trim()
  };
  if (!data.nombre || !data.colegioId || !data.gradoId) return alert('Nombre, colegio y grado son obligatorios.');
  if (id) await db.collection('alumnos').doc(id).update(data);
  else await db.collection('alumnos').add(data);
  closeModal('modal-alumno');
}

async function deleteAlumno(id) {
  if (!confirm('¿Deseas eliminar este alumno?')) return;
  await db.collection('alumnos').doc(id).delete();
}

// ============================================================================
// MÓDULO: LOGIN Y NAVEGACIÓN ADMIN
// ============================================================================
function autenticarProfesor(e) {
  e.preventDefault();
  const pass = document.getElementById('admin-pass').value;
  const passGuardada = localStorage.getItem(PASS_KEY) || 'admin123';
  if (pass !== passGuardada) return alert('Contraseña incorrecta.');
  document.getElementById('admin-pass').value = '';
  suscribirAlumnos();
  suscribirExamenes();
  suscribirResultados();
  mostrarVista('panel-admin');
  cambiarTabAdmin('colegios');
}

function cerrarSesionProfesor() { mostrarVista('home'); }

function cambiarTabAdmin(tab) {
  ['colegios', 'grados', 'alumnos', 'examenes', 'resultados', 'config'].forEach(t => {
    document.getElementById(`admtab-${t}`)?.classList.add('hidden');
    document.querySelector(`.admin-nav-link[data-tab="${t}"]`)?.classList.remove('active');
  });
  document.getElementById(`admtab-${tab}`)?.classList.remove('hidden');
  document.querySelector(`.admin-nav-link[data-tab="${tab}"]`)?.classList.add('active');
  if (tab === 'examenes') poblarSelectConTodos(document.getElementById('ex-colegio'), colegios);
  if (tab === 'resultados') { poblarFiltroColegios(); renderResultados(); }
}

function cambiarPasswordAdmin(e) {
  e.preventDefault();
  const nueva = document.getElementById('nueva-pass').value.trim();
  if (nueva.length < 4) return alert('Usa al menos 4 caracteres.');
  localStorage.setItem(PASS_KEY, nueva);
  document.getElementById('nueva-pass').value = '';
  alert('Contraseña actualizada.');
}

// ============================================================================
// MÓDULO: CREADOR DE EXÁMENES
// ============================================================================
function poblarSelectConTodos(select, items) {
  if (!select) return;
  const actual = select.value;
  select.innerHTML = '<option value="TODOS">Todos</option>';
  items.forEach(it => select.innerHTML += `<option value="${it.id}">${it.nombre}</option>`);
  if (actual) select.value = actual;
}

document.getElementById('ex-colegio')?.addEventListener('change', (e) => {
  const sel = document.getElementById('ex-grado');
  if (e.target.value === 'TODOS') {
    sel.innerHTML = '<option value="TODOS">Todos los grados/secciones</option>';
  } else {
    poblarSelectGrados(sel, e.target.value, true);
  }
});

function abrirCreadorExamen() {
  document.getElementById('form-crear-examen').reset();
  document.getElementById('contenedor-preguntas-creador').innerHTML = '';
  poblarSelectConTodos(document.getElementById('ex-colegio'), colegios);
  document.getElementById('ex-grado').innerHTML = '<option value="TODOS">Todos los grados/secciones</option>';
  actualizarValorPreview();
  openModal('vista-creador-examen');
}

function cerrarCreadorExamen() { closeModal('vista-creador-examen'); }

function agregarPreguntaCreador(tipo) {
  contadorPreguntasCreador++;
  const pId = contadorPreguntasCreador;
  const container = document.getElementById('contenedor-preguntas-creador');

  let html = `
    <div class="bg-white rounded-xl border p-4" id="pregC_${pId}" data-tipo="${tipo}">
      <div class="flex justify-between items-start mb-3">
        <span class="text-xs font-bold px-2 py-0.5 rounded ${tipo === 'fv' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}">
          ${tipo === 'fv' ? 'Falso / Verdadero' : 'Selección múltiple'}
        </span>
        <button type="button" onclick="document.getElementById('pregC_${pId}').remove(); actualizarValorPreview();" class="text-red-400 hover:text-red-600 text-sm">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="grid sm:grid-cols-4 gap-2 mb-2">
        <input type="text" class="preg-enunciado sm:col-span-3 px-3 py-2 border rounded-lg text-sm" placeholder="Enunciado de la pregunta" required>
        <input type="number" class="preg-puntos px-3 py-2 border rounded-lg text-sm" value="1" min="0.5" step="0.5" oninput="actualizarValorPreview()" placeholder="Pts" required>
      </div>`;

  if (tipo === 'fv') {
    html += `
      <div class="flex gap-4 text-sm mt-1">
        <label class="flex items-center gap-1"><input type="radio" name="rc_${pId}" value="Verdadero" checked> Verdadero</label>
        <label class="flex items-center gap-1"><input type="radio" name="rc_${pId}" value="Falso"> Falso</label>
      </div>`;
  } else {
    html += `
      <div class="space-y-1.5 mt-1">
        ${[0, 1, 2, 3].map(i => `
          <div class="flex items-center gap-2">
            <input type="radio" name="rc_${pId}" value="${i}" ${i === 0 ? 'checked' : ''}>
            <input type="text" class="preg-opcion flex-1 px-3 py-1.5 border rounded-lg text-sm" placeholder="Opción ${i + 1}" ${i < 2 ? 'required' : ''}>
          </div>`).join('')}
      </div>`;
  }
  html += `</div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function actualizarValorPreview() {
  let total = 0;
  document.querySelectorAll('.preg-puntos').forEach(inp => total += parseFloat(inp.value || 0));
  const el = document.getElementById('ex-valor-preview');
  if (el) el.innerText = total;
}

async function guardarExamenDB(e) {
  e.preventDefault();
  const bloques = document.querySelectorAll('#contenedor-preguntas-creador > div');
  if (bloques.length === 0) return alert('Agrega al menos una pregunta.');

  const preguntas = [];
  let valido = true;

  bloques.forEach(div => {
    const tipo = div.getAttribute('data-tipo');
    const pId = div.id.split('_')[1];
    const enunciado = div.querySelector('.preg-enunciado').value.trim();
    const puntos = parseFloat(div.querySelector('.preg-puntos').value);

    if (tipo === 'fv') {
      const respuestaCorrecta = div.querySelector(`input[name="rc_${pId}"]:checked`)?.value;
      preguntas.push({ tipo: 'fv', enunciado, puntos, respuestaCorrecta });
    } else {
      const opcionesInputs = div.querySelectorAll('.preg-opcion');
      const opciones = Array.from(opcionesInputs).map(i => i.value.trim()).filter(v => v);
      if (opciones.length < 2) valido = false;
      const idxCorrecta = parseInt(div.querySelector(`input[name="rc_${pId}"]:checked`)?.value || 0);
      preguntas.push({ tipo: 'mc', enunciado, puntos, opciones, respuestaCorrecta: opciones[idxCorrecta] });
    }
  });

  if (!valido) return alert('Cada pregunta de selección múltiple necesita al menos 2 opciones.');

  const valorTotal = preguntas.reduce((s, p) => s + p.puntos, 0);

  const examen = {
    titulo: document.getElementById('ex-titulo').value.trim(),
    materia: document.getElementById('ex-materia').value.trim(),
    logoUrl: document.getElementById('ex-logo').value.trim(),
    colegioId: document.getElementById('ex-colegio').value,
    gradoId: document.getElementById('ex-grado').value,
    tiempo: parseInt(document.getElementById('ex-tiempo').value),
    valor: valorTotal,
    estado: 'activo',
    preguntas,
    fecha: new Date().toISOString()
  };

  try {
    await db.collection('examenes').add(examen);
    cerrarCreadorExamen();
    alert('¡Examen guardado y publicado!');
  } catch (err) {
    console.error(err);
    alert('Hubo un error al guardar el examen.');
  }
}

function renderTablaExamenes() {
  const tbody = document.getElementById('tabla-examenes-contenedor');
  if (!tbody) return;
  tbody.innerHTML = '';
  examenes.forEach(ex => {
    const asignacion = ex.colegioId === 'TODOS' ? 'Todos los colegios' :
      `${nombreColegio(ex.colegioId)}${ex.gradoId && ex.gradoId !== 'TODOS' ? ' · ' + nombreGrado(ex.gradoId) : ' · Todos los grados'}`;
    tbody.innerHTML += `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-semibold">${ex.titulo}<br><span class="text-xs text-slate-400 font-normal">${ex.materia || ''}</span></td>
        <td class="p-3 text-xs">${asignacion}</td>
        <td class="p-3 text-xs">${ex.preguntas?.length || 0} · ${ex.valor} pts</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${ex.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
            ${ex.estado.toUpperCase()}
          </span>
        </td>
        <td class="p-3 text-right space-x-2">
          <button onclick="cambiarEstadoExamen('${ex.id}','${ex.estado}')" class="text-[var(--brand-600)]" title="Activar/Desactivar"><i class="fa-solid fa-power-off"></i></button>
          <button onclick="eliminarExamen('${ex.id}')" class="text-red-500" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
  if (examenes.length === 0) tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 text-sm">Aún no has creado exámenes.</td></tr>`;
}

async function cambiarEstadoExamen(id, estadoActual) {
  await db.collection('examenes').doc(id).update({ estado: estadoActual === 'activo' ? 'inactivo' : 'activo' });
}

async function eliminarExamen(id) {
  if (!confirm('¿Eliminar este examen permanentemente? Los resultados ya guardados no se borrarán.')) return;
  await db.collection('examenes').doc(id).delete();
}

// ============================================================================
// MÓDULO: ALUMNO — INGRESO Y LISTADO DE EXÁMENES
// ============================================================================
function iniciarSesionAlumno(e) {
  e.preventDefault();
  const colegioId = document.getElementById('alumno-colegio').value;
  const gradoId = document.getElementById('alumno-grado').value;
  alumnoSesion = {
    nombre: document.getElementById('alumno-nombre').value.trim(),
    colegioId,
    colegioNombre: nombreColegio(colegioId),
    gradoId,
    gradoNombre: nombreGrado(gradoId)
  };
  document.getElementById('alumno-saludo').innerText = `Hola, ${alumnoSesion.nombre}`;
  document.getElementById('alumno-info-tag').innerText = `${alumnoSesion.colegioNombre} · ${alumnoSesion.gradoNombre}`;
  mostrarVista('lista-examenes');
  cargarExamenesDisponibles();
}

function cerrarSesionAlumno() {
  alumnoSesion = null;
  examenActivo = null;
  document.body.classList.remove('modo-examen');
  mostrarVista('home');
}

let unsubExamenesAlumno = null;
function cargarExamenesDisponibles() {
  const container = document.getElementById('contenedor-examenes-disponibles');
  container.innerHTML = '<p class="text-sm text-slate-400 col-span-2">Cargando exámenes...</p>';

  if (unsubExamenesAlumno) unsubExamenesAlumno();
  unsubExamenesAlumno = db.collection('examenes').onSnapshot(snap => {
    const disponibles = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(ex => ex.estado === 'activo'
        && (ex.colegioId === 'TODOS' || ex.colegioId === alumnoSesion.colegioId)
        && (!ex.gradoId || ex.gradoId === 'TODOS' || ex.gradoId === alumnoSesion.gradoId));

    container.innerHTML = '';
    if (disponibles.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-400 col-span-2 text-center py-8">No hay exámenes disponibles por el momento.</p>';
      return;
    }
    disponibles.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition';
      card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-bold">${ex.titulo}</h4>
          <span class="bg-[var(--brand-100)] text-[var(--brand-600)] text-xs px-2 py-0.5 rounded font-bold">${ex.valor} pts</span>
        </div>
        <p class="text-xs text-slate-500 mb-3"><i class="fa-solid fa-book mr-1"></i>${ex.materia || 'General'}</p>
        <div class="flex justify-between items-center text-xs text-slate-400 border-t pt-3">
          <span><i class="fa-regular fa-clock mr-1"></i>${ex.tiempo} min</span>
          <button onclick="iniciarExamen('${ex.id}')" class="bg-[var(--brand-600)] hover:bg-[var(--brand-700)] text-white font-bold px-3 py-1.5 rounded-lg">Iniciar examen</button>
        </div>`;
      container.appendChild(card);
    });
  });
}

// ============================================================================
// MÓDULO: TOMAR EXAMEN
// ============================================================================
function iniciarExamen(examenId) {
  db.collection('examenes').doc(examenId).get().then(doc => {
    examenActivo = { id: doc.id, ...doc.data() };
    faltasCometidas = 0;

    document.getElementById('eval-titulo').innerText = examenActivo.titulo;
    document.getElementById('eval-materia').innerText = examenActivo.materia || '';
    document.getElementById('eval-valor').innerText = `Valor: ${examenActivo.valor} pts`;
    document.getElementById('eval-colegio').innerText = alumnoSesion.colegioNombre;
    document.getElementById('eval-grado').innerText = alumnoSesion.gradoNombre;

    const logo = document.getElementById('eval-logo');
    if (examenActivo.logoUrl) { logo.src = examenActivo.logoUrl; logo.classList.remove('hidden'); }
    else logo.classList.add('hidden');

    llenarMarcaAgua(`${alumnoSesion.nombre} · ${new Date().toLocaleDateString()}`);
    renderizarPreguntasExamen(examenActivo.preguntas);
    iniciarTemporizador(examenActivo.tiempo * 60);
    activarSensorAntiTrampas();
    document.body.classList.add('modo-examen');

    mostrarVista('evaluacion');
  });
}

function llenarMarcaAgua(texto) {
  const el = document.getElementById('marca-agua-examen');
  el.innerHTML = Array.from({ length: 40 }).map(() => `<span class="px-4">${texto}</span>`).join('');
}

function renderizarPreguntasExamen(preguntas) {
  const container = document.getElementById('contenedor-preguntas-alumno');
  container.innerHTML = '';
  preguntas.forEach((p, idx) => {
    let html = `<div class="bg-white p-4 rounded-xl border">
      <p class="font-semibold text-sm mb-2">${idx + 1}. ${p.enunciado} <span class="text-xs text-[var(--brand-600)]">(${p.puntos} pt)</span></p>`;

    if (p.tipo === 'fv') {
      html += `<div class="flex gap-6 text-sm">
        <label class="flex items-center gap-2"><input type="radio" name="resp_${idx}" value="Verdadero"> Verdadero</label>
        <label class="flex items-center gap-2"><input type="radio" name="resp_${idx}" value="Falso"> Falso</label>
      </div>`;
    } else {
      p.opciones.forEach(op => {
        html += `<label class="flex items-center gap-2 text-sm mb-1"><input type="radio" name="resp_${idx}" value="${op}"> ${op}</label>`;
      });
    }
    html += `</div>`;
    container.insertAdjacentHTML('beforeend', html);
  });
}

// --- Temporizador ---
function iniciarTemporizador(segundosTotales) {
  let t = segundosTotales;
  const display = document.getElementById('eval-timer');
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const m = Math.floor(t / 60), s = t % 60;
    display.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (t <= 0) {
      clearInterval(timerInterval);
      alert('¡Tiempo agotado! Tu examen se enviará automáticamente.');
      procesarYEnviarExamen(true);
    }
    t--;
  }, 1000);
}

// --- Anti-trampas (disuasivo, no infalible — ver nota en README) ---
function activarSensorAntiTrampas() {
  window.onblur = () => registrarFalta('Cambio de pestaña o ventana');
  window.onfocus = () => document.body.classList.remove('foco-perdido');
  document.onvisibilitychange = () => { if (document.hidden) registrarFalta('Minimizar / cambiar de pantalla'); };
  document.oncontextmenu = (e) => { e.preventDefault(); return false; };
  document.oncopy = (e) => { e.preventDefault(); return false; };
  document.onkeydown = (e) => {
    const bloqueadas = (e.key === 'F12') || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) || (e.ctrlKey && e.key === 'u');
    if (bloqueadas) { e.preventDefault(); registrarFalta('Intento de abrir herramientas de desarrollador'); }
  };
  document.onkeyup = (e) => {
    if (e.key === 'PrintScreen') registrarFalta('Intento de captura de pantalla');
  };
}

function desactivarSensorAntiTrampas() {
  window.onblur = null; window.onfocus = null;
  document.onvisibilitychange = null; document.oncontextmenu = null;
  document.oncopy = null; document.onkeydown = null; document.onkeyup = null;
  clearInterval(timerInterval);
  document.body.classList.remove('modo-examen', 'foco-perdido');
}

function registrarFalta(motivo) {
  if (!examenActivo) return;
  faltasCometidas++;
  document.body.classList.add('foco-perdido');
  document.getElementById('falta-contador').innerText = faltasCometidas;
  document.getElementById('modal-falta').classList.remove('hidden');

  if (faltasCometidas >= 3) {
    desactivarSensorAntiTrampas();
    alert('Examen anulado: se acumularon 3 faltas de seguridad.');
    procesarYEnviarExamen(true, true);
  }
}

function cerrarModalFalta() {
  document.getElementById('modal-falta').classList.add('hidden');
  document.body.classList.remove('foco-perdido');
}

function finalizarExamenManual(e) {
  e.preventDefault();
  if (!confirm('¿Confirmas que deseas finalizar y enviar el examen?')) return;
  desactivarSensorAntiTrampas();
  procesarYEnviarExamen(false);
}

function procesarYEnviarExamen(automatico = false, anulado = false) {
  let notaObtenida = 0;
  const desglose = [];

  if (!anulado) {
    examenActivo.preguntas.forEach((p, idx) => {
      const marcada = document.querySelector(`input[name="resp_${idx}"]:checked`);
      const respuestaAlumno = marcada ? marcada.value : '';
      const esCorrecta = respuestaAlumno !== '' && respuestaAlumno === p.respuestaCorrecta;
      if (esCorrecta) notaObtenida += p.puntos;
      desglose.push({
        pregunta: p.enunciado,
        respuestaAlumno: respuestaAlumno || '(Sin responder)',
        respuestaEsperada: p.respuestaCorrecta,
        esCorrecta,
        puntos: esCorrecta ? p.puntos : 0
      });
    });
  }

  const resultado = {
    examenId: examenActivo.id,
    examenTitulo: examenActivo.titulo,
    alumnoNombre: alumnoSesion.nombre,
    colegioId: alumnoSesion.colegioId,
    colegioNombre: alumnoSesion.colegioNombre,
    gradoId: alumnoSesion.gradoId,
    gradoNombre: alumnoSesion.gradoNombre,
    notaObtenida,
    notaTotal: examenActivo.valor,
    faltas: faltasCometidas,
    anulado,
    fecha: new Date().toISOString(),
    desglose
  };

  db.collection('resultados').add(resultado).then(() => {
    document.body.classList.remove('modo-examen');
    mostrarResultadoAlumno(resultado);
  }).catch(err => {
    console.error(err);
    alert('El examen se calificó pero hubo un error al guardarlo. Toma una captura de este resultado.');
    document.body.classList.remove('modo-examen');
    mostrarResultadoAlumno(resultado);
  });
}

function mostrarResultadoAlumno(res) {
  mostrarVista('resultado-alumno');
  document.getElementById('res-alumno-nombre').innerText = `${res.alumnoNombre} · ${res.colegioNombre}`;
  document.getElementById('res-punteo').innerText = `${res.notaObtenida} / ${res.notaTotal}`;
  const porc = res.notaTotal > 0 ? Math.round((res.notaObtenida / res.notaTotal) * 100) : 0;
  document.getElementById('res-porcentaje').innerText = res.anulado ? 'Examen anulado' : `${porc}% de acierto`;

  document.getElementById('res-icon').innerHTML = res.anulado
    ? '<i class="fa-solid fa-circle-xmark text-red-500"></i>'
    : '<i class="fa-solid fa-circle-check text-emerald-500"></i>';

  const faltasBox = document.getElementById('res-faltas-box');
  if (res.faltas > 0) { faltasBox.classList.remove('hidden'); document.getElementById('res-total-faltas').innerText = res.faltas; }
  else faltasBox.classList.add('hidden');

  const cont = document.getElementById('res-desglose');
  cont.innerHTML = '';
  res.desglose.forEach(d => {
    const div = document.createElement('div');
    div.className = `p-3 rounded-lg border text-sm ${d.esCorrecta ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`;
    div.innerHTML = `<p class="font-semibold">${d.pregunta}</p>
      <p class="text-xs mt-1">Tu respuesta: ${d.respuestaAlumno}</p>
      ${!d.esCorrecta ? `<p class="text-xs font-semibold mt-0.5">Respuesta correcta: ${d.respuestaEsperada}</p>` : ''}`;
    cont.appendChild(div);
  });
}

// ============================================================================
// MÓDULO: NOTAS Y REPORTES
// ============================================================================
function poblarFiltroColegios() {
  const sel = document.getElementById('filtroColegio');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todos los colegios</option>';
  colegios.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
  sel.value = actual;
  sel.onchange = () => {
    poblarSelectGrados2(document.getElementById('filtroGrado'), sel.value);
    renderResultados();
  };
}

function poblarSelectGrados2(select, colegioId) {
  select.innerHTML = '<option value="">Todos los grados</option>';
  grados.filter(g => !colegioId || g.colegioId === colegioId).forEach(g => {
    select.innerHTML += `<option value="${g.id}">${nombreColegio(g.colegioId)} — ${g.nombre} ${g.seccion}</option>`;
  });
}

function resultadosFiltrados() {
  const nombre = (document.getElementById('filtroAlumno')?.value || '').toLowerCase();
  const colegioId = document.getElementById('filtroColegio')?.value || '';
  const gradoId = document.getElementById('filtroGrado')?.value || '';
  const desde = document.getElementById('filtroDesde')?.value;
  const hasta = document.getElementById('filtroHasta')?.value;

  return resultados.filter(r => {
    if (nombre && !r.alumnoNombre.toLowerCase().includes(nombre)) return false;
    if (colegioId && r.colegioId !== colegioId) return false;
    if (gradoId && r.gradoId !== gradoId) return false;
    if (desde && r.fecha < desde) return false;
    if (hasta && r.fecha > hasta + 'T23:59:59') return false;
    return true;
  });
}

function renderResultados() {
  poblarSelectGrados2(document.getElementById('filtroGrado'), document.getElementById('filtroColegio')?.value || '');
  const lista = resultadosFiltrados();
  const tbody = document.getElementById('tabla-resultados-contenedor');
  if (!tbody) return;
  tbody.innerHTML = '';
  lista.forEach(r => {
    tbody.innerHTML += `
      <tr class="border-b hover:bg-slate-50">
        <td class="p-3 font-semibold">${r.alumnoNombre}</td>
        <td class="p-3 text-xs">${r.colegioNombre} · ${r.gradoNombre}</td>
        <td class="p-3 text-xs">${r.examenTitulo}</td>
        <td class="p-3 font-bold ${r.anulado ? 'text-red-500' : 'text-[var(--brand-700)]'}">${r.notaObtenida} / ${r.notaTotal}</td>
        <td class="p-3 text-xs">${r.faltas > 0 ? `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">${r.faltas}</span>` : '0'}</td>
        <td class="p-3 text-xs text-slate-400">${fmtFecha(r.fecha)}</td>
      </tr>`;
  });
  if (lista.length === 0) tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 text-sm">No hay resultados con estos filtros.</td></tr>`;
  document.getElementById('print-fecha').innerText = new Date().toLocaleString('es-GT');
}

function exportarPDFResultados() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lista = resultadosFiltrados();

  doc.setFontSize(15);
  doc.text('Reporte de Notas — EduControl', 14, 15);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 21);

  doc.autoTable({
    startY: 27,
    head: [['Alumno', 'Colegio / Grado', 'Examen', 'Nota', 'Faltas', 'Fecha']],
    body: lista.map(r => [
      r.alumnoNombre,
      `${r.colegioNombre} / ${r.gradoNombre}`,
      r.examenTitulo,
      `${r.notaObtenida} / ${r.notaTotal}${r.anulado ? ' (Anulado)' : ''}`,
      r.faltas,
      fmtFecha(r.fecha)
    ]),
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [44, 70, 166] }
  });

  doc.save('Reporte_Notas_EduControl.pdf');
}

// ============================================================================
// RESPALDO
// ============================================================================
function exportarRespaldoJSON() {
  const data = { colegios, grados, alumnos, examenes, resultados };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo_educontrol_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
