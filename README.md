# Calendario de Evaluaciones

Next.js 15 (App Router) + React 19 + TypeScript, con funciones Rust en Vercel.

## Funciones
- Calendario mensual, filtro por ramo, búsqueda y ocultar hechas
- Marcar evaluaciones como hechas, modo oscuro
- Resumen/estadísticas (`api/stats.rs`, Rust)
- Exportar a `.ics` para Google Calendar/Outlook/iPhone con recordatorio 1 día antes (`api/ics.rs`, Rust)
- Compartido en línea con Firebase Realtime Database (opcional)

## Desarrollo
```
npm install
npm run dev
```
En `next dev` las rutas Rust no existen: las estadísticas usan un respaldo en JS y `.ics` avisa que requiere Vercel. Para probar Rust local: `vercel dev`.

## Compartir con el curso
1. Crea una Realtime Database en https://console.firebase.google.com (modo test).
2. En Vercel → Settings → Environment Variables: `NEXT_PUBLIC_DATABASE_URL` = `https://xxxx-default-rtdb.firebaseio.com`. Redeploy.

Sin esa variable funciona en modo local (solo tu navegador).

## Deploy
Importa el repo en https://vercel.com/new (preset Next.js). `vercel.json` ya activa el runtime de Rust para `api/*.rs`.
