"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cargar, eliminar, enLinea, guardar, type Evento, type Eventos } from "@/lib/store";

const TIPOS = ["Prueba", "Control", "Examen", "Entrega / Trabajo", "Presentación", "Otro"];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Stats = {
  total: number;
  pendientes: number;
  hechos: number;
  atrasados: number;
  proximos_7_dias: number;
  proxima_en_dias: number | null;
  por_ramo: Record<string, number>;
  por_tipo: Record<string, number>;
  semana_mas_cargada: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const color = (nombre: string) => {
  let h = 0;
  for (const c of nombre.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},60%,42%)`;
};
const vacio = (fecha: string, autor: string): Evento => ({
  ramo: "", tipo: TIPOS[0], fecha, hora: "", notas: "", autor, hecho: false, actualizado: 0,
});

// Respaldo en JS por si la función Rust no está disponible (p. ej. `next dev` local).
function statsLocal(evs: Evento[], hoy: string): Stats {
  const dd = (f: string) => Math.round((Date.parse(f + "T00:00:00Z") - Date.parse(hoy + "T00:00:00Z")) / 864e5);
  const s: Stats = {
    total: evs.length, pendientes: 0, hechos: 0, atrasados: 0, proximos_7_dias: 0,
    proxima_en_dias: null, por_ramo: {}, por_tipo: {}, semana_mas_cargada: null,
  };
  const sem: Record<number, number> = {};
  for (const e of evs) {
    s.por_ramo[e.ramo] = (s.por_ramo[e.ramo] || 0) + 1;
    s.por_tipo[e.tipo] = (s.por_tipo[e.tipo] || 0) + 1;
    if (e.hecho) { s.hechos++; continue; }
    s.pendientes++;
    const d = dd(e.fecha);
    if (d < 0) { s.atrasados++; continue; }
    if (d <= 7) s.proximos_7_dias++;
    if (s.proxima_en_dias === null || d < s.proxima_en_dias) s.proxima_en_dias = d;
    const w = Math.floor((Date.parse(e.fecha + "T00:00:00Z") / 864e5 + 3) / 7);
    sem[w] = (sem[w] || 0) + 1;
  }
  const v = Object.values(sem);
  s.semana_mas_cargada = v.length ? Math.max(...v) : null;
  return s;
}

export default function Calendario() {
  const [eventos, setEventos] = useState<Eventos>({});
  const [mes, setMes] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [filtro, setFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [ocultarHechos, setOcultarHechos] = useState(false);
  const [oscuro, setOscuro] = useState(false);
  const [editando, setEditando] = useState<{ id: string | null; ev: Evento } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hoy, setHoy] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setHoy(iso(new Date()));
    const t = localStorage.getItem("tema");
    const o = t ? t === "oscuro" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setOscuro(o);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
  }, [oscuro]);

  const refrescar = useCallback(async () => {
    try { setEventos(await cargar()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => {
    refrescar();
    if (!enLinea) return;
    const t = setInterval(() => { if (!dlg.current?.open) refrescar(); }, 10000);
    return () => clearInterval(t);
  }, [refrescar]);

  const lista = useMemo(() => Object.entries(eventos).map(([id, e]) => ({ id, ...e })), [eventos]);
  const ramos = useMemo(() => [...new Set(lista.map(e => e.ramo))].sort(), [lista]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter(e =>
      (!filtro || e.ramo === filtro) &&
      (!ocultarHechos || !e.hecho) &&
      (!q || `${e.ramo} ${e.tipo} ${e.notas} ${e.autor}`.toLowerCase().includes(q)));
  }, [lista, filtro, busqueda, ocultarHechos]);

  const proximas = useMemo(() =>
    visibles.filter(e => !e.hecho && e.fecha >= hoy)
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).slice(0, 12),
    [visibles, hoy]);

  // Estadísticas calculadas por la función Rust (/api/stats)
  useEffect(() => {
    if (!hoy) return;
    const payload = lista.map(e => ({ ramo: e.ramo, tipo: e.tipo, fecha: e.fecha, hecho: e.hecho }));
    const ctl = new AbortController();
    fetch("/api/stats", { method: "POST", body: JSON.stringify({ hoy, eventos: payload }), signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setStats)
      .catch(() => { if (!ctl.signal.aborted) setStats(statsLocal(lista, hoy)); });
    return () => ctl.abort();
  }, [lista, hoy]);

  const celdas = useMemo(() => {
    const y = mes.getFullYear(), m = mes.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - offset + i));
  }, [mes]);

  const abrir = (id: string | null, fecha?: string) => {
    const autor = localStorage.getItem("autor") || "";
    setEditando({ id, ev: id ? { ...eventos[id] } : vacio(fecha || iso(new Date()), autor) });
    setTimeout(() => dlg.current?.showModal(), 0);
  };
  const cerrar = () => { dlg.current?.close(); setEditando(null); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const ev = { ...editando.ev, ramo: editando.ev.ramo.trim(), actualizado: Date.now() };
    localStorage.setItem("autor", ev.autor);
    const id = editando.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setEventos(p => ({ ...p, [id]: ev }));
    cerrar();
    await guardar(id, ev);
  };
  const borrar = async () => {
    if (!editando?.id || !confirm("¿Eliminar esta evaluación?")) return;
    const id = editando.id;
    setEventos(p => { const n = { ...p }; delete n[id]; return n; });
    cerrar();
    await eliminar(id);
  };
  const alternarHecho = async (id: string) => {
    const ev = { ...eventos[id], hecho: !eventos[id].hecho, actualizado: Date.now() };
    setEventos(p => ({ ...p, [id]: ev }));
    await guardar(id, ev);
  };

  const exportar = async () => {
    const r = await fetch("/api/ics", {
      method: "POST",
      body: JSON.stringify(visibles.map(({ id, ramo, tipo, fecha, hora, notas }) => ({ id, ramo, tipo, fecha, hora, notas }))),
    });
    if (!r.ok) return alert("La exportación .ics solo funciona en Vercel (usa la función Rust).");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = "evaluaciones.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  const campo = <K extends keyof Evento>(k: K, v: Evento[K]) =>
    setEditando(p => p && { ...p, ev: { ...p.ev, [k]: v } });
  const cuando = (f: string) => {
    const d = Math.round((Date.parse(f + "T00:00:00Z") - Date.parse(hoy + "T00:00:00Z")) / 864e5);
    return d === 0 ? "¡Hoy!" : d === 1 ? "Mañana" : `En ${d} días`;
  };

  return (
    <>
      <header>
        <h1>📚 Calendario de Evaluaciones</h1>
        <div className="badge">{enLinea ? "🌐 Compartido en línea" : "💾 Modo local (solo tu navegador)"}</div>
        <button onClick={() => setOscuro(o => { localStorage.setItem("tema", o ? "claro" : "oscuro"); return !o; })} title="Cambiar tema">
          {oscuro ? "☀️" : "🌙"}
        </button>
        <button onClick={exportar} title="Descargar para Google Calendar / Outlook / iPhone">📥 Exportar .ics</button>
        <button className="primary" onClick={() => abrir(null)}>+ Nueva evaluación</button>
      </header>

      <main>
        <section className="cal">
          <div className="cal-nav">
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
            <h2>{mes.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}</h2>
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
            <button onClick={() => setMes(() => { const d = new Date(); d.setDate(1); return d; })}>Hoy</button>
          </div>
          <div className="filtros">
            <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Ramo">
              <option value="">Todos los ramos</option>
              {ramos.map(r => <option key={r}>{r}</option>)}
            </select>
            <input type="search" placeholder="Buscar…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <label className="chk"><input type="checkbox" checked={ocultarHechos} onChange={e => setOcultarHechos(e.target.checked)} /> Ocultar hechas</label>
          </div>
          <div className="grid dow">{DOW.map(d => <div key={d}>{d}</div>)}</div>
          <div className="grid">
            {celdas.map(d => {
              const key = iso(d);
              const evs = visibles.filter(e => e.fecha === key).sort((a, b) => a.hora.localeCompare(b.hora));
              return (
                <div key={key} className={`dia ${d.getMonth() !== mes.getMonth() ? "otro" : ""} ${key === hoy ? "hoy" : ""}`}
                  onClick={() => abrir(null, key)}>
                  <span className="n">{d.getDate()}</span>
                  {evs.map(e => (
                    <span key={e.id} className={`ev ${e.hecho ? "hecho" : ""}`} style={{ background: color(e.ramo) }}
                      title={`${e.ramo} - ${e.tipo}`} onClick={ev => { ev.stopPropagation(); abrir(e.id); }}>
                      {e.hora} {e.ramo}: {e.tipo}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <aside>
          {stats && stats.total > 0 && (
            <div className="stats">
              <h3>📊 Resumen <small>(Rust)</small></h3>
              <div className="kpis">
                <div><b>{stats.pendientes}</b><span>pendientes</span></div>
                <div><b>{stats.proximos_7_dias}</b><span>en 7 días</span></div>
                <div className={stats.atrasados ? "alerta" : ""}><b>{stats.atrasados}</b><span>atrasadas</span></div>
                <div><b>{stats.hechos}</b><span>hechas</span></div>
              </div>
              {stats.semana_mas_cargada !== null && <p className="muted">Semana más cargada: {stats.semana_mas_cargada} evaluaciones</p>}
              <div className="barras">
                {Object.entries(stats.por_ramo).map(([r, n]) => (
                  <div key={r}><span>{r}</span><i style={{ width: `${(n / stats.total) * 100}%`, background: color(r) }} />{n}</div>
                ))}
              </div>
            </div>
          )}
          <h3>Próximas evaluaciones</h3>
          <ul>
            {proximas.length ? proximas.map(e => (
              <li key={e.id} style={{ borderColor: color(e.ramo) }} onClick={() => abrir(e.id)}>
                <input type="checkbox" checked={e.hecho} title="Marcar como hecha"
                  onClick={ev => ev.stopPropagation()} onChange={() => alternarHecho(e.id)} />
                <div>
                  <b>{e.ramo}</b> – {e.tipo}
                  <small>{e.fecha.split("-").reverse().join("/")} {e.hora} · {cuando(e.fecha)}</small>
                </div>
              </li>
            )) : <li>No hay evaluaciones próximas 🎉</li>}
          </ul>
        </aside>
      </main>

      <dialog ref={dlg} onClose={() => setEditando(null)}>
        {editando && (
          <form onSubmit={enviar}>
            <h3>{editando.id ? "Editar evaluación" : "Nueva evaluación"}</h3>
            <label>Ramo
              <input list="ramos" required placeholder="Ej: Cálculo II" value={editando.ev.ramo} onChange={e => campo("ramo", e.target.value)} />
              <datalist id="ramos">{ramos.map(r => <option key={r} value={r} />)}</datalist>
            </label>
            <label>Tipo
              <select value={editando.ev.tipo} onChange={e => campo("tipo", e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Fecha <input type="date" required value={editando.ev.fecha} onChange={e => campo("fecha", e.target.value)} /></label>
            <label>Hora (opcional) <input type="time" value={editando.ev.hora} onChange={e => campo("hora", e.target.value)} /></label>
            <label>Qué entra / notas
              <textarea rows={6} placeholder="Capítulos, temas, materiales, tips..." value={editando.ev.notas} onChange={e => campo("notas", e.target.value)} />
            </label>
            <label>Tu nombre <input placeholder="Opcional" value={editando.ev.autor} onChange={e => campo("autor", e.target.value)} /></label>
            <label className="chk"><input type="checkbox" checked={editando.ev.hecho} onChange={e => campo("hecho", e.target.checked)} /> Ya está hecha</label>
            <div className="acciones">
              {editando.id && <button type="button" className="danger" onClick={borrar}>Eliminar</button>}
              <span className="sp" />
              <button type="button" onClick={cerrar}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
