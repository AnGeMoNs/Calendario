export type Evento = {
  ramo: string;
  tipo: string;
  fecha: string; // YYYY-MM-DD
  hora: string;
  notas: string;
  autor: string;
  hecho: boolean;
  actualizado: number;
};
export type Eventos = Record<string, Evento>;

const DB = (process.env.NEXT_PUBLIC_DATABASE_URL || "").replace(/\/$/, "");
const LOCAL_KEY = "evaluaciones_v2";

export const enLinea = !!DB;

function getLocal(): Eventos {
  return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
}

export async function cargar(): Promise<Eventos> {
  if (DB) {
    const r = await fetch(`${DB}/eventos.json`);
    return (await r.json()) || {};
  }
  return getLocal();
}

export async function guardar(id: string, ev: Evento) {
  if (DB) {
    await fetch(`${DB}/eventos/${id}.json`, { method: "PUT", body: JSON.stringify(ev) });
  } else {
    const d = getLocal();
    d[id] = ev;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  }
}

export async function eliminar(id: string) {
  if (DB) {
    await fetch(`${DB}/eventos/${id}.json`, { method: "DELETE" });
  } else {
    const d = getLocal();
    delete d[id];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  }
}
