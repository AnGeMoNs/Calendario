use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

#[derive(Deserialize)]
struct Evento {
    ramo: String,
    tipo: String,
    fecha: String, // YYYY-MM-DD
    #[serde(default)]
    hecho: bool,
}

#[derive(Deserialize)]
struct Entrada {
    hoy: String,
    eventos: Vec<Evento>,
}

#[derive(Serialize, Default)]
struct Salida {
    total: usize,
    pendientes: usize,
    hechos: usize,
    atrasados: usize,
    proximos_7_dias: usize,
    proxima_en_dias: Option<i64>,
    por_ramo: BTreeMap<String, usize>,
    por_tipo: BTreeMap<String, usize>,
    semana_mas_cargada: Option<usize>, // max. evaluaciones pendientes en una semana
}

// Dias desde 1970-01-01 (algoritmo de Howard Hinnant)
fn dias(fecha: &str) -> Option<i64> {
    let p: Vec<i64> = fecha.split('-').filter_map(|x| x.parse().ok()).collect();
    if p.len() != 3 {
        return None;
    }
    let (mut y, m, d) = (p[0], p[1], p[2]);
    if m <= 2 {
        y -= 1;
    }
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}

fn calcular(e: Entrada) -> Salida {
    let mut s = Salida::default();
    let hoy = match dias(&e.hoy) {
        Some(h) => h,
        None => return s,
    };
    let mut semanas: BTreeMap<i64, usize> = BTreeMap::new();
    for ev in &e.eventos {
        let Some(d) = dias(&ev.fecha) else { continue };
        s.total += 1;
        *s.por_ramo.entry(ev.ramo.clone()).or_insert(0) += 1;
        *s.por_tipo.entry(ev.tipo.clone()).or_insert(0) += 1;
        if ev.hecho {
            s.hechos += 1;
            continue;
        }
        s.pendientes += 1;
        if d < hoy {
            s.atrasados += 1;
        } else {
            if d - hoy <= 7 {
                s.proximos_7_dias += 1;
            }
            if s.proxima_en_dias.map_or(true, |x| d - hoy < x) {
                s.proxima_en_dias = Some(d - hoy);
            }
            // 1970-01-01 fue jueves; (d+3)/7 agrupa por semana lunes-domingo
            *semanas.entry((d + 3).div_euclid(7)).or_insert(0) += 1;
        }
    }
    s.semana_mas_cargada = semanas.values().copied().max();
    s
}

async fn handler(req: Request) -> Result<Response<Body>, Error> {
    let bytes: Vec<u8> = match req.body() {
        Body::Text(s) => s.clone().into_bytes(),
        Body::Binary(b) => b.clone(),
        Body::Empty => Vec::new(),
    };
    match serde_json::from_slice::<Entrada>(&bytes) {
        Ok(e) => Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Body::Text(serde_json::to_string(&calcular(e))?))?),
        Err(_) => Ok(Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("Content-Type", "application/json")
            .body(Body::Text("{\"error\":\"JSON invalido\"}".into()))?),
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}
