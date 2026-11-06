const $ = s => document.querySelector(s);
const DB = (window.CONFIG.databaseURL || "").replace(/\/$/, "");
const LOCAL_KEY = "evaluaciones_v1";
let events = {};            // id -> evento
let current = new Date(); current.setDate(1);
let editingId = null;

// ---------- Almacenamiento (Firebase REST o localStorage) ----------
const store = {
  async load() {
    if (DB) { const r = await fetch(`${DB}/eventos.json`); return (await r.json()) || {}; }
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  },
  async save(id, ev) {
    if (DB) { await fetch(`${DB}/eventos/${id}.json`, { method: "PUT", body: JSON.stringify(ev) }); }
    else { const d = await this.load(); d[id] = ev; localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); }
  },
  async remove(id) {
    if (DB) { await fetch(`${DB}/eventos/${id}.json`, { method: "DELETE" }); }
    else { const d = await this.load(); delete d[id]; localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); }
  }
};

async function refresh() {
  try { events = await store.load(); } catch (e) { console.error(e); }
  render();
}

// ---------- Utilidades ----------
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function colorRamo(nombre) {
  let h = 0; for (const c of nombre.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},60%,42%)`;
}
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lista = () => Object.entries(events).map(([id, e]) => ({ id, ...e }));

// ---------- Render ----------
function render() {
  const filtro = $("#filtroRamo");
  const ramos = [...new Set(lista().map(e => e.ramo))].sort();
  const sel = filtro.value;
  filtro.innerHTML = `<option value="">Todos</option>` + ramos.map(r => `<option ${r === sel ? "selected" : ""}>${esc(r)}</option>`).join("");
  $("#ramos").innerHTML = ramos.map(r => `<option value="${esc(r)}">`).join("");
  const visibles = lista().filter(e => !filtro.value || e.ramo === filtro.value);

  $("#mesLabel").textContent = current.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const y = current.getFullYear(), m = current.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes primero
  const start = new Date(y, m, 1 - offset);
  const hoy = iso(new Date());
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = iso(d);
    const evs = visibles.filter(e => e.fecha === key).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
    html += `<div class="dia ${d.getMonth() !== m ? "otro" : ""} ${key === hoy ? "hoy" : ""}" data-fecha="${key}">
      <span class="n">${d.getDate()}</span>
      ${evs.map(e => `<span class="ev" data-id="${e.id}" style="background:${colorRamo(e.ramo)}" title="${esc(e.ramo)} - ${esc(e.tipo)}">${esc(e.hora || "")} ${esc(e.ramo)}: ${esc(e.tipo)}</span>`).join("")}
    </div>`;
  }
  $("#dias").innerHTML = html;

  const prox = visibles.filter(e => e.fecha >= hoy).sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || ""))).slice(0, 12);
  $("#proximas").innerHTML = prox.length ? prox.map(e => {
    const dias = Math.round((new Date(e.fecha + "T00:00") - new Date(hoy + "T00:00")) / 864e5);
    const cuando = dias === 0 ? "¡Hoy!" : dias === 1 ? "Mañana" : `En ${dias} días`;
    return `<li data-id="${e.id}" style="border-color:${colorRamo(e.ramo)}"><b>${esc(e.ramo)}</b> – ${esc(e.tipo)}
      <small>${e.fecha.split("-").reverse().join("/")} ${esc(e.hora || "")} · ${cuando}</small></li>`;
  }).join("") : "<li>No hay evaluaciones próximas 🎉</li>";
}

// ---------- Diálogo ----------
function abrir(id, fecha) {
  editingId = id || null;
  const f = $("#form"); f.reset();
  const e = id ? events[id] : null;
  $("#dlgTitulo").textContent = e ? "Editar evaluación" : "Nueva evaluación";
  $("#btnEliminar").classList.toggle("hidden", !e);
  if (e) for (const k of ["ramo", "tipo", "fecha", "hora", "notas", "autor"]) f.elements[k].value = e[k] || "";
  else { f.elements.fecha.value = fecha || iso(new Date()); f.elements.autor.value = localStorage.getItem("autor") || ""; }
  $("#dlg").showModal();
}

$("#form").addEventListener("submit", async ev => {
  const f = ev.target.elements;
  const data = { ramo: f.ramo.value.trim(), tipo: f.tipo.value, fecha: f.fecha.value, hora: f.hora.value,
                 notas: f.notas.value, autor: f.autor.value.trim(), actualizado: Date.now() };
  localStorage.setItem("autor", data.autor);
  const id = editingId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  events[id] = data; render();
  await store.save(id, data);
});
$("#btnCancelar").onclick = () => $("#dlg").close();
$("#btnEliminar").onclick = async () => {
  if (!confirm("¿Eliminar esta evaluación?")) return;
  delete events[editingId]; render(); $("#dlg").close();
  await store.remove(editingId);
};

// ---------- Eventos ----------
$("#btnNuevo").onclick = () => abrir();
$("#prev").onclick = () => { current.setMonth(current.getMonth() - 1); render(); };
$("#next").onclick = () => { current.setMonth(current.getMonth() + 1); render(); };
$("#hoy").onclick = () => { current = new Date(); current.setDate(1); render(); };
$("#filtroRamo").onchange = render;
$("#dias").addEventListener("click", e => {
  const ev = e.target.closest(".ev");
  if (ev) return abrir(ev.dataset.id);
  const d = e.target.closest(".dia"); if (d) abrir(null, d.dataset.fecha);
});
$("#proximas").addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) abrir(li.dataset.id); });

// ---------- Inicio ----------
$("#titulo").textContent = "📚 " + window.CONFIG.titulo;
document.title = window.CONFIG.titulo;
$("#modo").textContent = DB ? "🌐 Compartido en línea" : "💾 Modo local (solo tu navegador)";
$(".dow").innerHTML = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => `<div>${d}</div>`).join("");
refresh();
if (DB) setInterval(() => { if (!$("#dlg").open) refresh(); }, 10000);

