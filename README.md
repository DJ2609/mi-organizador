# Mi Organizador

App personal de hábitos, tareas, metas, agenda, ánimo y asistente — extraída de Claude Artifacts para correr de forma independiente en cualquier navegador.

## Qué cambió respecto a la versión de Claude

- `window.storage` → reemplazado por `localStorage` del navegador. Tus datos ahora viven solo en el dispositivo/navegador donde abras la app (no se sincronizan entre dispositivos).
- El Asistente ya no usa la conexión automática de Claude Artifacts: ahora necesita **tu propia clave de API de Anthropic**, que se guarda también en `localStorage` (ver sección de abajo). El resto del diseño y las funciones son iguales.

## 1. Requisitos

- [Node.js](https://nodejs.org) 18 o superior (incluye `npm`).

## 2. Instalar y correr en tu computador

```bash
cd mi-organizador
npm install
npm run dev
```

Abre `http://localhost:5173` en tu navegador (o en el celular, si está en la misma red, usando la IP de tu computador).

## 3. Compilar para producción

```bash
npm run build
```

Esto genera una carpeta `dist/` con HTML, CSS y JS ya optimizados y listos para subir a cualquier hosting estático.

## 4. Alojarla gratis (elige una opción)

**Vercel (recomendado, más simple):**
```bash
npm install -g vercel
vercel
```
Sigue las instrucciones en pantalla (crea cuenta gratis si no tienes). Detecta Vite automáticamente.

**Netlify:**
1. Corre `npm run build`.
2. Ve a [app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta `dist/`.

**GitHub Pages / Cloudflare Pages:**
Sube este proyecto a un repositorio de GitHub y conéctalo desde el panel de Pages/Cloudflare; ambos detectan Vite (comando de build: `npm run build`, carpeta de salida: `dist`).

Una vez alojada, puedes abrir el link desde tu celular y usar "Agregar a pantalla de inicio" en el navegador para tener un ícono como si fuera una app.

## 5. Clave de API para el Asistente (opcional)

La pestaña **Asistente** llama directamente a la API de Anthropic desde el navegador. Para usarla:

1. Ve a [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys), crea una cuenta si no tienes, y genera una clave (`sk-ant-...`).
2. En la app, abre la pestaña Asistente y toca el ícono de ajustes (⚙) para pegar tu clave. Se guarda solo en tu navegador.
3. Las llamadas a la API tienen costo (según tu plan de Anthropic); revisa los precios en la consola.

**Importante sobre seguridad:** como la clave se usa directamente desde el navegador (sin un servidor intermedio), queda visible en el tráfico de red de tu propio dispositivo. Esto es razonable para uso personal en tu propio celular/computador, pero **no compartas el link público de tu app alojada con esa clave activa**, porque cualquiera que la abra podría inspeccionar la clave desde las herramientas de desarrollador del navegador. Si más adelante quieres compartir la app con otras personas, lo correcto es mover esa llamada a un pequeño backend propio que guarde la clave del lado del servidor.

Si prefieres no usar el Asistente, simplemente no configures la clave; el resto de la app (Hoy, Agenda, Hábitos, Tareas, Metas, Ánimo, Progreso) funciona igual sin ella.

## 6. Tus datos

- Todo se guarda en `localStorage` bajo las claves `mi-organizador:app-data` y `mi-organizador:assistant-chat`.
- Borrar el historial/caché del navegador para este sitio borra tus datos. Para hacer respaldo manual, puedes abrir la consola del navegador (F12) y ejecutar:
  ```js
  copy(localStorage.getItem("mi-organizador:app-data"))
  ```
  eso copia tus datos al portapapeles como texto (JSON) que puedes guardar en un archivo.

## Estructura del proyecto

```
mi-organizador/
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── src/
    ├── main.jsx      (punto de entrada de React)
    ├── App.jsx       (toda la aplicación: componentes, lógica y estilos)
    └── index.css     (reseteo mínimo de estilos globales)
```

No hay imágenes ni recursos externos: los íconos vienen de la librería `lucide-react` y la tipografía se carga desde Google Fonts (`Manrope`) mediante un `@import` dentro de `App.jsx`.
