# EduControl — Sistema de Gestión Escolar y Exámenes

Sistema web para administrar colegios, grados/secciones, alumnos y exámenes
(falso/verdadero y selección múltiple), con calificación automática, historial
de notas y reportes imprimibles/PDF. Los datos se guardan en **Firebase
Firestore** (plan gratuito), configurable desde el propio portal — no se
necesita tocar código.

## Uso

1. Abre `index.html` en cualquier navegador (Windows, Mac o Android — es una
   página web normal, no requiere instalación).
2. La primera vez, el sistema te pedirá conectar tu base de datos:
   - Ve a [console.firebase.google.com](https://console.firebase.google.com),
     crea un proyecto (gratis).
   - Dentro del proyecto: **Compilación → Firestore Database → Crear base de
     datos**.
   - **Configuración del proyecto → Tus apps → Agregar app Web** y copia los
     datos de `firebaseConfig`.
   - Pégalos en la pantalla de configuración del portal.
3. Entra como **Administrador** (contraseña inicial: `admin123`, cámbiala
   desde Configuración) para registrar colegios, grados/secciones, alumnos y
   crear exámenes.
4. Los alumnos entran por **"Soy Alumno"**, se identifican, y ven solo los
   exámenes activos asignados a su colegio/grado/sección.

## Funcionalidades

- **Colegios**: crear, editar, eliminar, buscar.
- **Grados y secciones**: crear, editar, eliminar, buscar, asociados a un colegio.
- **Alumnos**: registro con colegio y grado/sección asignados.
- **Exámenes**: preguntas de falso/verdadero y selección múltiple, tiempo
  límite, asignación a un colegio/grado específico o a todos.
- **Calificación automática** al enviar el examen.
- **Reportes**: filtro por alumno, colegio, grado/sección y rango de fechas;
  exportación a PDF e impresión directa.
- **Respaldo**: exportación completa de los datos en JSON.

## Sobre la seguridad durante el examen (léelo)

El sistema incluye medidas disuasivas: bloqueo del clic derecho, del copiado
de texto, detección de cambio de pestaña/minimizado, y detección de la tecla
Impr Pant y de atajos comunes de herramientas de desarrollador. **Ninguna de
estas medidas es infalible**: un navegador siempre puede evitarlas con
herramientas de desarrollador, extensiones, o simplemente tomando una foto
con otro dispositivo. Tres faltas detectadas anulan el examen automáticamente,
pero esto es una capa de disuasión, no una garantía absoluta de integridad.

## Sobre la seguridad de acceso

El login de administrador usado aquí es una contraseña simple guardada en el
navegador (`localStorage`), sin backend de autenticación real. Es suficiente
para uso interno de un solo colegio o pequeño grupo, pero **antes de usar
esto en producción real con datos sensibles de estudiantes**, se recomienda:

- Configurar **reglas de seguridad de Firestore** (por defecto, un proyecto
  nuevo puede quedar con acceso abierto).
- Considerar **Firebase Authentication** para un control de acceso más
  robusto si varios colegios van a compartir la misma base de datos.

## Archivos

- `index.html` — estructura de todas las pantallas.
- `app.js` — toda la lógica (Firebase, CRUD, exámenes, reportes).
- `styles.css` — estilos y protecciones visuales adicionales.
