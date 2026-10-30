/**
 * Servidor mock SOLO para desarrollo local: `pnpm --filter web dev:mock`.
 * Reemplaza `fetch` y contesta las rutas de la API con los datos de `mock/db.json`, sin API ni base.
 * Se carga con import dinámico desde main.tsx únicamente si `import.meta.env.DEV` y
 * `VITE_MOCK=true`, así que no entra en el build de producción. Los cambios viven en memoria
 * (recargar la página vuelve a los datos del JSON).
 */
import seed from "../../mock/db.json";
import { API_URL } from "../api/client";

type Role = "caregiver" | "admin" | "patient";
interface Json {
  [k: string]: unknown;
}
interface Db {
  users: { id: string; role: Role; email: string | null }[];
  admins: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  }[];
  caregivers: {
    user_id: string;
    first_name: string;
    last_names: string;
    phone: string;
    email: string;
    birth_date: string;
  }[];
  patients: { user_id: string; first_name: string; last_name: string }[];
  caregiver_patients: [string, string][];
  medications: { id: string; patient_id: string; name: string; dose: string; times: string[] }[];
  task_templates: { id: string; patient_id: string; text: string; time: string | null }[];
  shifts: {
    id: string;
    caregiver_id: string;
    patient_id: string;
    day: number;
    start: string;
    end: string;
    source: string;
  }[];
  wellbeing: {
    caregiver_id: string;
    days_ago: number;
    mood: number;
    energy: number;
    stress: number;
    note: string;
  }[];
  reminders: Record<string, unknown>;
  devices: {
    user_id: string;
    label: string | null;
    last_ip: string | null;
    last_seen_days_ago: number | null;
    blocked?: { label: string; ip: string | null; days_ago: number };
  }[];
  mail_log: {
    to_email: string;
    subject: string;
    kind: string;
    status: string;
    days_ago: number;
    error: string | null;
  }[];
  assistant_reply: string;
}

const db = structuredClone(seed) as unknown as Db;
const done = new Set<string>(); // "fecha|paciente|clave"
/** Marcas de tiempo (ms) de los mensajes de contacto, por usuario (el límite es de 3 por 24 h). */
const contactByUser = new Map<string, number[]>();

const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDay(new Date());
const dayOffset = (n: number) => isoDay(new Date(Date.now() + n * DAY));
const uid = () => crypto.randomUUID();
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

class MockError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const bad = (message: string) => new MockError(400, "invalid_input", message);
const notFound = (message = "No encontramos lo que buscás.") =>
  new MockError(404, "not_found", message);

const nameOf = (id: string): string => {
  const c = db.caregivers.find((x) => x.user_id === id);
  if (c) return `${c.first_name} ${c.last_names}`;
  const a = db.admins.find((x) => x.user_id === id);
  if (a) return `${a.first_name} ${a.last_name}`;
  const p = db.patients.find((x) => x.user_id === id);
  return p ? `${p.first_name} ${p.last_name}` : "Sin nombre";
};

interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json;
  user: { id: string; role: Role } | null;
}

const toShift = (s: Db["shifts"][number]) => ({
  id: s.id,
  caregiver_id: s.caregiver_id,
  patient_id: s.patient_id,
  date: dayOffset(s.day),
  start: s.start,
  end: s.end,
  source: s.source,
});

const myPatients = (cid: string) =>
  db.caregiver_patients
    .filter(([c]) => c === cid)
    .map(([, p]) => db.patients.find((x) => x.user_id === p))
    .filter((p): p is Db["patients"][number] => !!p);

const medsOf = (pid: string) =>
  db.medications
    .filter((m) => m.patient_id === pid)
    .map(({ id, name, dose, times }) => ({ id, name, dose, times }));

const need = (r: Req): { id: string; role: Role } => {
  if (!r.user) throw new MockError(401, "unauthorized", "Tenés que iniciar sesión.");
  return r.user;
};
const only = (r: Req, role: Role) => {
  const u = need(r);
  if (u.role !== role) throw new MockError(403, "forbidden", "No tenés permiso para hacer esto.");
  return u;
};

/** Mismas reglas que la API: una sola línea, hasta 100; mensaje de 1 a 2000. */
function contact(r: Req) {
  const u = need(r);
  const subject = String(r.body.subject ?? "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  const message = String(r.body.message ?? "").trim();
  if (subject.length > 100) throw bad("El asunto puede tener hasta 100 caracteres.");
  if (!message) throw bad("Escribí tu mensaje.");
  if (message.length > 2000) throw bad("El mensaje puede tener hasta 2000 caracteres.");
  const recent = (contactByUser.get(u.id) ?? []).filter((t) => t > Date.now() - DAY);
  if (recent.length >= 3) {
    throw new MockError(
      429,
      "rate_limited",
      "Ya mandaste 3 mensajes en las últimas 24 horas. Probá de nuevo más tarde.",
    );
  }
  contactByUser.set(u.id, [...recent, Date.now()]);
  // Para probar el estado de error del formulario: incluí [mock:502] en el mensaje.
  if (message.includes("[mock:502]")) {
    throw new MockError(
      502,
      "mail_failed",
      "No pudimos enviar tu mensaje ahora. Quedó guardado; probá de nuevo en un rato.",
    );
  }
  console.info(
    `[mock] contacto de ${nameOf(u.id)}: "${subject || "Sin asunto"}" (${message.length} caracteres)`,
  );
  db.mail_log.unshift({
    to_email: "info@redasistir.online",
    subject: "Mensaje de contacto",
    kind: "contact",
    status: "sent",
    days_ago: 0,
    error: null,
  });
  return { ok: true };
}

type Handler = (r: Req, p: string[]) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp(`^${path.replace(/:[a-z]+/g, "([^/]+)")}$`), h]);

route("GET", "/health", () => ({ ok: true }));
route("GET", "/demo/users", () => ({
  users: [...db.users]
    .sort(
      (a, b) =>
        ["admin", "caregiver", "patient"].indexOf(a.role) -
        ["admin", "caregiver", "patient"].indexOf(b.role),
    )
    .map((u) => ({ id: u.id, role: u.role, email: u.email, name: nameOf(u.id) })),
}));
route("GET", "/device/status", (r) => {
  const d = db.devices.find((x) => x.user_id === need(r).id);
  return {
    registered: !!d?.label,
    label: d?.label ?? null,
    last_seen_at: d?.last_seen_days_ago != null ? ago(d.last_seen_days_ago) : null,
  };
});

// Perfil
route("GET", "/me", (r) => {
  const u = need(r);
  const { user_id: _id, ...profile } = db.caregivers.find((x) => x.user_id === u.id) ??
    db.admins.find((x) => x.user_id === u.id) ??
    db.patients.find((x) => x.user_id === u.id) ?? { user_id: "" };
  return { id: u.id, role: u.role, profile: Object.keys(profile).length ? profile : null };
});
route("PUT", "/me/profile", (r) => {
  const c = db.caregivers.find((x) => x.user_id === only(r, "caregiver").id);
  if (c) Object.assign(c, r.body);
  return { ok: true };
});
route("GET", "/me/patients", (r) => ({
  patients: myPatients(only(r, "caregiver").id).map((p) => ({
    id: p.user_id,
    first_name: p.first_name,
    last_name: p.last_name,
    medications: medsOf(p.user_id),
  })),
}));
route("DELETE", "/me", () => ({ ok: true }));

// Turnos
route("GET", "/shifts", (r) => {
  const id = only(r, "caregiver").id;
  const from = r.query.get("from") ?? "0000-00-00";
  const to = r.query.get("to") ?? "9999-99-99";
  return {
    shifts: db.shifts
      .filter((s) => s.caregiver_id === id)
      .map(toShift)
      .filter((s) => s.date >= from && s.date <= to)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
  };
});
route("POST", "/shifts", (r) => {
  const id = only(r, "caregiver").id;
  const b = r.body as {
    patient_id: string;
    date: string;
    start: string;
    end: string;
    repeat_weeks?: number;
  };
  const base = Math.round(
    (new Date(`${b.date}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / DAY,
  );
  const created = Array.from({ length: b.repeat_weeks ?? 1 }, (_, i) => ({
    id: uid(),
    caregiver_id: id,
    patient_id: b.patient_id,
    day: base + i * 7,
    start: b.start,
    end: b.end,
    source: "manual",
  }));
  db.shifts.push(...created);
  return { __status: 201, shifts: created.map(toShift) };
});
route("DELETE", "/shifts/:id", (r, [sid]) => {
  const i = db.shifts.findIndex((s) => s.id === sid && s.caregiver_id === only(r, "caregiver").id);
  if (i < 0) throw notFound("No encontramos ese turno.");
  db.shifts.splice(i, 1);
  return { ok: true };
});

// Tareas
route("GET", "/tasks", (r) => {
  const date = r.query.get("date") ?? today();
  return {
    date,
    patients: myPatients(only(r, "caregiver").id).map((p) => ({
      patient: { id: p.user_id, first_name: p.first_name, last_name: p.last_name },
      tasks: [
        ...db.medications
          .filter((m) => m.patient_id === p.user_id)
          .flatMap((m) =>
            m.times.map((t) => ({
              key: `med-${m.id}-${t}`,
              text: `Dar ${m.name} ${m.dose}`,
              time: t,
              med: true,
              done: done.has(`${date}|${p.user_id}|med-${m.id}-${t}`),
            })),
          ),
        ...db.task_templates
          .filter((t) => t.patient_id === p.user_id)
          .map((t) => ({
            key: t.id,
            text: t.text,
            time: t.time,
            med: false,
            done: done.has(`${date}|${p.user_id}|${t.id}`),
          })),
      ].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    })),
  };
});
route("POST", "/tasks/completions", (r) => {
  only(r, "caregiver");
  const b = r.body as { date: string; patient_id: string; task_key: string; done: boolean };
  const k = `${b.date}|${b.patient_id}|${b.task_key}`;
  if (b.done) done.add(k);
  else done.delete(k);
  return { ok: true };
});
route("POST", "/tasks/templates", (r) => {
  only(r, "caregiver");
  const b = r.body as { patient_id: string; text: string; time?: string };
  if (!String(b.text ?? "").trim()) throw bad("Escribí la tarea.");
  const id = uid();
  db.task_templates.push({
    id,
    patient_id: b.patient_id,
    text: b.text.trim(),
    time: b.time ?? null,
  });
  return { __status: 201, id };
});
route("DELETE", "/tasks/templates/:id", (r, [tid]) => {
  only(r, "caregiver");
  const i = db.task_templates.findIndex((t) => t.id === tid);
  if (i < 0) throw notFound("No encontramos esa tarea.");
  db.task_templates.splice(i, 1);
  return { ok: true };
});

// Bienestar
route("POST", "/wellbeing", (r) => {
  const b = r.body as { mood: number; energy: number; stress: number; note?: string };
  db.wellbeing.push({
    caregiver_id: only(r, "caregiver").id,
    days_ago: 0,
    mood: b.mood,
    energy: b.energy,
    stress: b.stress,
    note: b.note ?? "",
  });
  return { __status: 201, id: uid(), at: new Date().toISOString() };
});
route("GET", "/wellbeing", (r) => {
  const id = only(r, "caregiver").id;
  return {
    records: db.wellbeing
      .filter((w) => w.caregiver_id === id)
      .sort((a, b) => a.days_ago - b.days_ago)
      .map((w, i) => ({
        id: `w${i}`,
        at: ago(w.days_ago),
        mood: w.mood,
        energy: w.energy,
        stress: w.stress,
        note: w.note,
      })),
  };
});
route("GET", "/wellbeing/weekly", (r) => {
  const id = only(r, "caregiver").id;
  const monday = (d: Date) => {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return isoDay(x);
  };
  const weeks = new Map<string, Db["wellbeing"]>();
  const byDay = new Map<string, Record<string, number>>();
  for (const w of db.wellbeing
    .filter((x) => x.caregiver_id === id)
    .sort((a, b) => b.days_ago - a.days_ago)) {
    const d = new Date(Date.now() - w.days_ago * DAY);
    const wk = monday(d);
    weeks.set(wk, [...(weeks.get(wk) ?? []), w]);
    byDay.set(wk, { ...(byDay.get(wk) ?? {}), [isoDay(d)]: w.mood });
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([week_start, ws]) => ({
        week_start,
        count: ws.length,
        avg_mood: avg(ws.map((w) => w.mood)),
        avg_energy: avg(ws.map((w) => w.energy)),
        avg_stress: avg(ws.map((w) => w.stress)),
        mood_by_day: byDay.get(week_start) ?? {},
      })),
  };
});

// Recordatorios
const DEFAULT_REMINDERS = {
  water: { on: true, freq: 60, from: "08:00", to: "20:00" },
  stretch: { on: true, freq: 120, from: "09:00", to: "19:00" },
  relax: { on: false, times: [] as string[] },
};
route("GET", "/reminders", (r) => db.reminders[need(r).id] ?? DEFAULT_REMINDERS);
route("PUT", "/reminders", (r) => {
  db.reminders[need(r).id] = r.body;
  return { ok: true };
});

// Asistente (sin modelo: respuesta fija)
route("POST", "/assistant/chat", () => ({ reply: db.assistant_reply, added: [] }));
route("POST", "/assistant/undo", () => ({ deleted: 0 }));

// Persona cuidada
route("GET", "/patient/today", (r) => {
  const id = only(r, "patient").id;
  const p = db.patients.find((x) => x.user_id === id);
  const shifts = db.shifts
    .filter((s) => s.patient_id === id)
    .map((s) => ({ ...toShift(s), caregiver: nameOf(s.caregiver_id) }))
    .map(({ date, start, end, caregiver }) => ({ date, start, end, caregiver }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const now = `${today()} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  return {
    patient: p ? { first_name: p.first_name, last_name: p.last_name } : null,
    date: today(),
    today_shifts: shifts.filter((s) => s.date === today()),
    current:
      shifts.find((s) => `${s.date} ${s.start}` <= now && `${s.date} ${s.end}` > now) ?? null,
    next: shifts.find((s) => `${s.date} ${s.start}` > now) ?? null,
    doses: medsOf(id)
      .flatMap((m) => m.times.map((time) => ({ time, name: m.name, dose: m.dose })))
      .sort((a, b) => a.time.localeCompare(b.time)),
  };
});

// Administración
route("GET", "/admin/summary", (r) => {
  only(r, "admin");
  const t = new Date();
  const next = db.caregivers
    .map((c) => {
      const [, m, d] = c.birth_date.split("-").map(Number) as [number, number, number];
      let date = new Date(t.getFullYear(), m - 1, d);
      if (isoDay(date) < today()) date = new Date(t.getFullYear() + 1, m - 1, d);
      return {
        first_name: c.first_name,
        date: isoDay(date),
        days: Math.round((date.getTime() - new Date(`${today()}T00:00:00`).getTime()) / DAY),
      };
    })
    .sort((a, b) => a.days - b.days)[0];
  return {
    caregivers: db.caregivers.length,
    patients: db.patients.length,
    shifts_this_week: db.shifts.filter((s) => s.day >= 0 && s.day < 7).length,
    blocked_attempts: db.devices.filter((d) => d.blocked).length,
    next_birthday: next ?? null,
  };
});
route("GET", "/admin/admins", (r) => {
  only(r, "admin");
  return {
    admins: db.admins.map((a) => ({
      id: a.user_id,
      first_name: a.first_name,
      last_name: a.last_name,
      email: a.email,
      mobile: a.mobile,
    })),
  };
});
route("GET", "/admin/caregivers", (r) => {
  only(r, "admin");
  return {
    caregivers: db.caregivers.map(({ user_id, ...c }) => ({
      id: user_id,
      ...c,
      patient_ids: db.caregiver_patients.filter(([cg]) => cg === user_id).map(([, p]) => p),
    })),
  };
});
route("POST", "/admin/caregivers", (r) => {
  only(r, "admin");
  const b = r.body as Db["caregivers"][number] & { patient_ids?: string[] };
  const id = uid();
  db.users.push({ id, role: "caregiver", email: b.email });
  db.caregivers.push({
    user_id: id,
    first_name: b.first_name,
    last_names: b.last_names,
    phone: b.phone,
    email: b.email,
    birth_date: b.birth_date,
  });
  for (const p of b.patient_ids ?? []) db.caregiver_patients.push([id, p]);
  return { __status: 201, id };
});
route("PUT", "/admin/caregivers/:id/patients", (r, [cid]) => {
  only(r, "admin");
  db.caregiver_patients = db.caregiver_patients.filter(([c]) => c !== cid);
  for (const p of new Set((r.body.patient_ids as string[]) ?? []))
    db.caregiver_patients.push([cid!, p]);
  return { ok: true };
});
route("GET", "/admin/patients", (r) => {
  only(r, "admin");
  return {
    patients: db.patients.map((p) => ({
      id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      has_login: !!db.users.find((u) => u.id === p.user_id)?.email,
      caregiver_ids: db.caregiver_patients.filter(([, pid]) => pid === p.user_id).map(([c]) => c),
      medications: medsOf(p.user_id),
    })),
  };
});
route("POST", "/admin/patients", (r) => {
  only(r, "admin");
  const b = r.body as { first_name: string; last_name: string; email?: string };
  const id = uid();
  db.users.push({ id, role: "patient", email: b.email ?? null });
  db.patients.push({ user_id: id, first_name: b.first_name, last_name: b.last_name });
  return { __status: 201, id };
});
route("POST", "/admin/patients/:id/medications", (r, [pid]) => {
  only(r, "admin");
  const b = r.body as { name: string; dose: string; times: string[] };
  const med = {
    id: uid(),
    patient_id: pid!,
    name: b.name,
    dose: b.dose,
    times: [...b.times].sort(),
  };
  db.medications.push(med);
  return { __status: 201, id: med.id, name: med.name, dose: med.dose, times: med.times };
});
route("DELETE", "/admin/medications/:id", (r, [mid]) => {
  only(r, "admin");
  db.medications = db.medications.filter((m) => m.id !== mid);
  return { ok: true };
});
route("GET", "/admin/devices", (r) => {
  only(r, "admin");
  return {
    devices: db.users
      .filter((u) => u.email)
      .map((u) => {
        const d = db.devices.find((x) => x.user_id === u.id);
        return {
          id: u.id,
          role: u.role,
          name: nameOf(u.id),
          label: d?.label ?? null,
          last_ip: d?.last_ip ?? null,
          last_seen_at: d?.last_seen_days_ago != null ? ago(d.last_seen_days_ago) : null,
          blocked: d?.blocked
            ? { label: d.blocked.label, ip: d.blocked.ip, at: ago(d.blocked.days_ago) }
            : null,
        };
      }),
  };
});
route("POST", "/admin/devices/:id/release", (r, [did]) => {
  only(r, "admin");
  const d = db.devices.find((x) => x.user_id === did);
  if (d) Object.assign(d, { label: null, last_ip: null, last_seen_days_ago: null });
  return { ok: true };
});
route("POST", "/admin/devices/:id/authorize", (r, [did]) => {
  only(r, "admin");
  const d = db.devices.find((x) => x.user_id === did);
  if (!d?.blocked) throw notFound("No hay un intento bloqueado para autorizar.");
  delete d.blocked;
  return { ok: true };
});
route("POST", "/admin/mail/test", (r) => {
  only(r, "admin");
  db.mail_log.unshift({
    to_email: String(r.body.to ?? ""),
    subject: "Prueba de Cuidarte+",
    kind: "test",
    status: "sent",
    days_ago: 0,
    error: null,
  });
  return { status: "sent" };
});
route("GET", "/admin/mail/log", (r) => {
  only(r, "admin");
  return {
    log: db.mail_log.map((m, i) => ({
      id: `m${i}`,
      to_email: m.to_email,
      subject: m.subject,
      kind: m.kind,
      sent_at: ago(m.days_ago),
      status: m.status,
      error: m.error,
    })),
  };
});

route("POST", "/contact", contact);

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const base = new URL(API_URL);
  const path = url.pathname.slice(base.pathname.replace(/\/$/, "").length) || "/";
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const id = token.startsWith("demo:") ? token.slice(5) : "";
  const found = db.users.find((u) => u.id === id);
  const req: Req = {
    method: request.method,
    path,
    query: url.searchParams,
    body:
      request.method === "GET" || request.method === "DELETE"
        ? {}
        : ((await request.json().catch(() => ({}))) as Json),
    user: found ? { id: found.id, role: found.role } : null,
  };
  try {
    for (const [method, re, h] of routes) {
      const m = method === req.method ? re.exec(path) : null;
      if (!m) continue;
      const { __status = 200, ...body } = h(req, m.slice(1)) as Json & { __status?: number };
      return Response.json(body, { status: __status });
    }
    throw notFound(`El modo mock no implementa ${req.method} ${path}.`);
  } catch (e) {
    if (!(e instanceof MockError)) throw e;
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
}

export function installMock(): void {
  const real = globalThis.fetch.bind(globalThis);
  const apiOrigin = new URL(API_URL).origin;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== apiOrigin) return real(input, init);
    return handle(request);
  };
  console.info(`[mock] API simulada con mock/db.json (${apiOrigin}). Sin base de datos ni red.`);
}
