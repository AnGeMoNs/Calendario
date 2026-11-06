use serde::Deserialize;
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

#[derive(Deserialize)]
struct Evento {
    id: String,
    ramo: String,
    tipo: String,
    fecha: String, // YYYY-MM-DD
    #[serde(default)]
    hora: String, // HH:MM
    #[serde(default)]
    notas: String,
}

fn esc(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace("\r\n", "\\n")
        .replace('\n', "\\n")
}

fn build(eventos: &[Evento]) -> String {
    let mut out = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendario Evaluaciones//ES\r\nCALSCALE:GREGORIAN\r\n",
    );
    for e in eventos {
        let d = e.fecha.replace('-', "");
        if d.len() != 8 {
            continue;
        }
        out.push_str("BEGIN:VEVENT\r\n");
        out.push_str(&format!("UID:{}@calendario-evaluaciones\r\n", esc(&e.id)));
        out.push_str(&format!("DTSTAMP:{}T000000Z\r\n", d));
        let h = e.hora.replace(':', "");
        if h.len() == 4 {
            out.push_str(&format!("DTSTART:{}T{}00\r\n", d, h));
        } else {
            out.push_str(&format!("DTSTART;VALUE=DATE:{}\r\n", d));
        }
        out.push_str(&format!("SUMMARY:{}\r\n", esc(&format!("{}: {}", e.ramo, e.tipo))));
        if !e.notas.is_empty() {
            out.push_str(&format!("DESCRIPTION:{}\r\n", esc(&e.notas)));
        }
        // Recordatorio 1 dia antes
        out.push_str("BEGIN:VALARM\r\nTRIGGER:-P1D\r\nACTION:DISPLAY\r\nDESCRIPTION:Evaluacion manana\r\nEND:VALARM\r\n");
        out.push_str("END:VEVENT\r\n");
    }
    out.push_str("END:VCALENDAR\r\n");
    out
}

fn json_error(msg: &str) -> Result<Response<Body>, Error> {
    Ok(Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .header("Content-Type", "application/json")
        .body(Body::Text(format!("{{\"error\":\"{}\"}}", msg)))?)
}

async fn handler(req: Request) -> Result<Response<Body>, Error> {
    let bytes: Vec<u8> = match req.body() {
        Body::Text(s) => s.clone().into_bytes(),
        Body::Binary(b) => b.clone(),
        Body::Empty => Vec::new(),
    };
    let eventos: Vec<Evento> = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return json_error("JSON invalido"),
    };
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/calendar; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=\"evaluaciones.ics\"")
        .body(Body::Text(build(&eventos)))?)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}
