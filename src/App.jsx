import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Repeat, ClipboardList, Target, Smile, Plus, X, Check, Trash2,
  Pencil, ChevronDown, ChevronUp, AlertTriangle, Moon, Sun, Pause, Play,
  Circle, CircleCheck, CalendarClock, ChevronLeft, ChevronRight, Sparkles,
  TrendingUp, ArrowUp, ArrowDown, Minus, Send, MessageCircle, Settings, KeyRound
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* ---------- helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_LABELS = { SU: "D", MO: "L", TU: "M", WE: "X", TH: "J", FR: "V", SA: "S" };
const weekdayCode = (dateStr) => DAY_CODES[new Date(dateStr + "T00:00:00").getDay()];

function weekRange(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay(); // 0 = Sunday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toISO(monday), end: toISO(sunday) };
}

function isHabitDueToday(habit, dateStr) {
  if (habit.type === "daily") return true;
  if (habit.type === "specific_days") return habit.days.includes(weekdayCode(dateStr));
  if (habit.type === "weekly_count") return true; // se ofrece cualquier día hasta cumplir la meta
  return false;
}

function weeklyCompletedCount(habit, logs, dateStr) {
  const { start, end } = weekRange(dateStr);
  return logs.filter(
    (l) => l.habitId === habit.id && l.completed && l.date >= start && l.date <= end
  ).length;
}

const PRIORITY = {
  esencial: { label: "Esencial", color: "#B1503B", order: 0 },
  importante: { label: "Importante", color: "#C68A3D", order: 1 },
  si_tiempo: { label: "Si tengo tiempo", color: "#9C968C", order: 2 },
};

const DEFAULT_DATA = { habits: [], habitLogs: [], tasks: [], goals: [], moodEntries: [], difficultDays: [], events: [], onboarded: false };

function timeToMin(t) { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m) { m = Math.max(0, Math.min(23 * 60 + 59, m)); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function eventDueOn(ev, dateStr) {
  if (ev.date) return ev.date === dateStr;
  return ev.day === weekdayCode(dateStr);
}
function daysArray(start, end) {
  const out = []; let d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  while (d <= e) { out.push(toISO(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  const end = `${ym}-${pad(last)}`;
  return { start, end };
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function habitsKnownOn(habits, dateStr) {
  return habits.filter((h) => (h.createdAt || "0000-00-00") <= dateStr);
}

/* Calcula el cumplimiento diario y por hábito dentro de un rango de fechas. */
function computeRangeStats(data, start, end) {
  const days = daysArray(start, end);
  const perHabit = {}; // id -> {due, done, name}
  const perDay = {}; // date -> {due, done}
  days.forEach((day) => {
    const habitsToday = habitsKnownOn(data.habits, day).filter((h) => isHabitDueToday(h, day));
    let due = 0, done = 0;
    habitsToday.forEach((h) => {
      due++;
      const completed = data.habitLogs.some((l) => l.habitId === h.id && l.date === day && l.completed);
      if (completed) done++;
      if (!perHabit[h.id]) perHabit[h.id] = { due: 0, done: 0, name: h.name };
      perHabit[h.id].due++;
      if (completed) perHabit[h.id].done++;
    });
    perDay[day] = { due, done, difficult: data.difficultDays.includes(day) };
  });
  const totalDue = Object.values(perDay).reduce((a, d) => a + d.due, 0);
  const totalDone = Object.values(perDay).reduce((a, d) => a + d.done, 0);
  const overallPct = totalDue ? Math.round((totalDone / totalDue) * 100) : null;

  const moods = data.moodEntries.filter((m) => m.date >= start && m.date <= end);
  const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  const avgMood = avg(moods.map((m) => m.mood));
  const avgEnergy = avg(moods.map((m) => m.energy));
  const avgStress = avg(moods.map((m) => m.stress));
  const sleepVals = moods.filter((m) => m.sleepHours).map((m) => Number(m.sleepHours));
  const avgSleep = avg(sleepVals);

  const tasksInRange = data.tasks.filter((t) => t.date && t.date >= start && t.date <= end);
  const tasksDone = tasksInRange.filter((t) => t.completed).length;
  const tasksPending = tasksInRange.filter((t) => !t.completed).length;

  const difficultCount = data.difficultDays.filter((d) => d >= start && d <= end).length;

  const habitRanking = Object.values(perHabit).filter((h) => h.due >= 2)
    .map((h) => ({ ...h, pct: Math.round((h.done / h.due) * 100) })).sort((a, b) => b.pct - a.pct);
  const bestHabit = habitRanking[0] || null;
  const worstHabit = habitRanking.length ? habitRanking[habitRanking.length - 1] : null;

  const dayEntries = Object.entries(perDay).filter(([, v]) => v.due > 0)
    .map(([date, v]) => ({ date, pct: Math.round((v.done / v.due) * 100), difficult: v.difficult }));
  const bestDay = dayEntries.length ? dayEntries.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const hardestDay = dayEntries.find((d) => d.difficult) || (dayEntries.length ? dayEntries.reduce((a, b) => (b.pct < a.pct ? b : a)) : null);

  return { perDay, perHabit, overallPct, avgMood, avgEnergy, avgStress, avgSleep, tasksDone, tasksPending, difficultCount, bestHabit, worstHabit, bestDay, hardestDay };
}

/* Observaciones basadas en patrones históricos (nunca causales). */
function computeInsights(data) {
  if (data.habitLogs.length < 10) return [];
  const insights = [];
  const firstDate = [...data.habitLogs].map((l) => l.date).sort()[0];
  const stats = computeRangeStats(data, firstDate, todayStr());

  const byWeekday = {};
  Object.entries(stats.perDay).forEach(([date, v]) => {
    if (!v.due) return;
    const wd = weekdayCode(date);
    if (!byWeekday[wd]) byWeekday[wd] = { due: 0, done: 0 };
    byWeekday[wd].due += v.due; byWeekday[wd].done += v.done;
  });
  const weekdayNames = { MO: "los lunes", TU: "los martes", WE: "los miércoles", TH: "los jueves", FR: "los viernes", SA: "los sábados", SU: "los domingos" };
  const ranked = Object.entries(byWeekday).filter(([, v]) => v.due >= 3)
    .map(([wd, v]) => ({ wd, pct: Math.round((v.done / v.due) * 100) })).sort((a, b) => b.pct - a.pct);
  if (ranked.length >= 3) {
    insights.push(`En los últimos registros, tu cumplimiento de hábitos ha sido más alto ${weekdayNames[ranked[0].wd]} (${ranked[0].pct}%) y más bajo ${weekdayNames[ranked[ranked.length - 1].wd]} (${ranked[ranked.length - 1].pct}%).`);
  }

  const sleepDays = data.moodEntries.filter((m) => m.period === "morning" && m.sleepHours);
  if (sleepDays.length >= 6) {
    const withLow = [], withHigh = [];
    sleepDays.forEach((m) => {
      const dayStat = stats.perDay[m.date];
      if (!dayStat || !dayStat.due) return;
      const pct = dayStat.done / dayStat.due;
      (Number(m.sleepHours) < 7 ? withLow : withHigh).push(pct);
    });
    if (withLow.length >= 3 && withHigh.length >= 3) {
      const avgLow = Math.round((withLow.reduce((a, b) => a + b, 0) / withLow.length) * 100);
      const avgHigh = Math.round((withHigh.reduce((a, b) => a + b, 0) / withHigh.length) * 100);
      if (Math.abs(avgHigh - avgLow) >= 10) {
        insights.push(`Los días en que registraste menos de 7 horas de sueño, tu cumplimiento promedio fue de ${avgLow}%, frente a ${avgHigh}% los días con 7 horas o más.`);
      }
    }
  }

  if (stats.worstHabit && stats.worstHabit.pct < 50 && stats.worstHabit.due >= 4) {
    insights.push(`El hábito con menor cumplimiento hasta ahora es "${stats.worstHabit.name}" (${stats.worstHabit.pct}%). Podrías probar con una frecuencia menor.`);
  }
  return insights.slice(0, 4);
}

/* Resumen de datos reales que se envía al asistente como contexto. */
function buildContext(data) {
  const today = todayStr();
  const week = weekRange(today);
  const stats = computeRangeStats(data, week.start, week.end);

  const dueHabitsTxt = habitsKnownOn(data.habits, today).filter((h) => h.active && isHabitDueToday(h, today)).map((h) => {
    const done = data.habitLogs.some((l) => l.habitId === h.id && l.date === today && l.completed);
    const freq = h.type === "daily" ? "diario" : h.type === "weekly_count" ? `${h.freqPerWeek}x/semana` : "días específicos";
    return `- ${h.name} (${freq})${h.essential ? " [esencial]" : ""}: ${done ? "cumplido hoy" : "pendiente hoy"}`;
  }).join("\n") || "Ninguno programado hoy.";

  const todaysTasksTxt = data.tasks.filter((t) => t.date === today).map((t) =>
    `- ${t.name} (${PRIORITY[t.priority].label}${t.time ? ", " + t.time : ""}): ${t.completed ? "completada" : "pendiente"}`
  ).join("\n") || "Ninguna para hoy.";

  const allHabitsTxt = data.habits.map((h) =>
    `- ${h.name}: ${h.active ? "activo" : "pausado"}, ${h.type === "daily" ? "diario" : h.type === "weekly_count" ? `${h.freqPerWeek}x/semana` : (h.days || []).join("/")}`
  ).join("\n") || "Sin hábitos registrados.";

  const goalsTxt = data.goals.map((g) => `- ${g.name} (${g.term} plazo)`).join("\n") || "Sin metas registradas.";

  const recentMoodTxt = [...data.moodEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((m) =>
    `- ${m.date} ${m.period === "morning" ? "mañana" : "noche"}: ánimo ${m.mood}, energía ${m.energy}, estrés ${m.stress}${m.sleepHours ? `, sueño ${m.sleepHours}h` : ""}`
  ).join("\n") || "Sin registros recientes.";

  const pendingTasksTxt = data.tasks.filter((t) => !t.completed && t.date && t.date >= today).slice(0, 10).map((t) =>
    `- ${t.name} (${t.date}${t.time ? " " + t.time : ""}, ${PRIORITY[t.priority].label})`
  ).join("\n") || "Ninguna.";

  return [
    `Fecha de hoy: ${today}${data.difficultDays.includes(today) ? " (marcado como día difícil)" : ""}`,
    `Hábitos de hoy:\n${dueHabitsTxt}`,
    `Tareas de hoy:\n${todaysTasksTxt}`,
    `Próximas tareas pendientes:\n${pendingTasksTxt}`,
    `Resumen de esta semana (${week.start} a ${week.end}): cumplimiento general ${stats.overallPct ?? "sin datos"}%, mejor hábito: ${stats.bestHabit ? `${stats.bestHabit.name} (${stats.bestHabit.pct}%)` : "sin datos"}, menor cumplimiento: ${stats.worstHabit ? `${stats.worstHabit.name} (${stats.worstHabit.pct}%)` : "sin datos"}, sueño promedio ${stats.avgSleep ?? "sin datos"}h, ánimo promedio ${stats.avgMood ?? "sin datos"}, energía promedio ${stats.avgEnergy ?? "sin datos"}, estrés promedio ${stats.avgStress ?? "sin datos"}, tareas completadas ${stats.tasksDone}, pendientes ${stats.tasksPending}, días difíciles ${stats.difficultCount}.`,
    `Todos los hábitos registrados:\n${allHabitsTxt}`,
    `Metas:\n${goalsTxt}`,
    `Últimos registros de ánimo:\n${recentMoodTxt}`,
  ].join("\n\n");
}

/* ---------- datos sugeridos para el primer día ---------- */
const SUGGESTED_GOALS = [
  { key: "academico", name: "Tener un muy buen rendimiento académico", term: "mediano", objectives: ["Establecer una rutina de estudio", "Preparar cada clase con anticipación"] },
  { key: "sueno", name: "Dormir mínimo 8 horas", term: "corto", objectives: [] },
  { key: "organizacion", name: "Mejorar mi organización del tiempo", term: "mediano", objectives: [] },
  { key: "constancia", name: "Desarrollar mayor constancia", term: "largo", objectives: [] },
  { key: "fisico", name: "Mejorar mi condición física, fuerza y capacidad funcional", term: "largo", objectives: [] },
  { key: "cuidado", name: "Desarrollar hábitos de cuidado personal y organización", term: "mediano", objectives: [] },
  { key: "habilidades", name: "Aprender nuevas habilidades", term: "largo", objectives: [] },
  { key: "curso", name: "Realizar en el futuro un curso virtual que complemente mi carrera", term: "largo", objectives: [] },
];
const SUGGESTED_HABITS = [
  { name: "Planear el día", type: "daily", measurement: "boolean", essential: true, goalKey: "organizacion" },
  { name: "Preparación de clase", type: "daily", measurement: "duracion", unit: "minutos", essential: true, goalKey: "academico" },
  { name: "Repaso del mismo día", type: "daily", measurement: "boolean", essential: true, goalKey: "academico" },
  { name: "Dormir 8 horas", type: "daily", measurement: "numerico", unit: "horas", essential: true, goalKey: "sueno" },
  { name: "Entrenar (gym)", type: "weekly_count", freqPerWeek: 2, measurement: "duracion", unit: "horas", essential: true, goalKey: "fisico" },
  { name: "Guitarra eléctrica", type: "weekly_count", freqPerWeek: 2, measurement: "duracion", unit: "horas", essential: false, goalKey: "habilidades" },
  { name: "Skincare", type: "daily", measurement: "boolean", essential: false, goalKey: "cuidado" },
  { name: "Peinarme / arreglarme", type: "daily", measurement: "boolean", essential: false, goalKey: "cuidado" },
  { name: "Organizar escritorio", type: "weekly_count", freqPerWeek: 2, measurement: "boolean", essential: false, goalKey: "cuidado" },
  { name: "Organizar cuarto", type: "weekly_count", freqPerWeek: 1, measurement: "boolean", essential: false, goalKey: "cuidado" },
  { name: "Leer", type: "weekly_count", freqPerWeek: 3, measurement: "duracion", unit: "minutos", essential: false, goalKey: "habilidades" },
];
const SUGGESTED_EVENTS = [
  { name: "Trabajo", day: "SA", start: "08:00", end: "13:00" },
  { name: "Robótica", day: "SA", start: "13:00", end: "17:00" },
  { name: "Viaje a Palmira", day: "FR", start: "18:00", end: "18:30" },
];

/* ---------- storage (localStorage del navegador) ---------- */
const STORAGE_KEY = "mi-organizador:app-data";
async function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch (e) {
    /* no existía todavía o el navegador bloqueó el acceso */
  }
  return DEFAULT_DATA;
}
async function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("No se pudo guardar", e);
  }
}

/* ---------- clave de API de Anthropic (para el Asistente) ---------- */
const API_KEY_STORAGE = "mi-organizador:anthropic-api-key";
function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch (e) { return ""; }
}
function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (e) { console.error(e); }
}

/* ---------- small UI atoms ---------- */
function Card({ children, style }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #E6E2DA", borderRadius: 16, padding: 16, ...style }}>{children}</div>;
}
function Pill({ children, color = "#9C968C", bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
      padding: "3px 10px", borderRadius: 999, color, background: bg || `${color}1A`,
    }}>{children}</span>
  );
}
function IconBtn({ onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
      borderRadius: 10, border: "1px solid #E6E2DA", background: "#FAFAF7", cursor: "pointer", color: "#6B655C",
    }}>{children}</button>
  );
}
function TextField({ label, value, onChange, type = "text", placeholder, style }) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 5 }}>{label}</div>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
          border: "1px solid #E6E2DA", fontSize: 15, fontFamily: "inherit", color: "#262420", background: "#FAFAF7",
        }}
      />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 5 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
        border: "1px solid #E6E2DA", fontSize: 15, fontFamily: "inherit", color: "#262420", background: "#FAFAF7",
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function PrimaryBtn({ onClick, children, style, type = "button" }) {
  return (
    <button type={type} onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 10, border: "none", background: "#2C6360", color: "#fff",
      fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style,
    }}>{children}</button>
  );
}
function GhostBtn({ onClick, children, style }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 10, border: "1px solid #E6E2DA", background: "transparent", color: "#6B655C",
      fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style,
    }}>{children}</button>
  );
}
function EmptyState({ text }) {
  return <div style={{ padding: "24px 8px", textAlign: "center", color: "#9C968C", fontSize: 14 }}>{text}</div>;
}

/* ---------- Onboarding: propuesta inicial basada en lo que me contaste ---------- */
function Onboarding({ update }) {
  const [selGoals, setSelGoals] = useState(() => Object.fromEntries(SUGGESTED_GOALS.map((g) => [g.key, true])));
  const [selHabits, setSelHabits] = useState(() => SUGGESTED_HABITS.map(() => true));
  const [selEvents, setSelEvents] = useState(() => SUGGESTED_EVENTS.map(() => true));

  const toggleGoal = (k) => setSelGoals((p) => ({ ...p, [k]: !p[k] }));
  const toggleHabit = (i) => setSelHabits((p) => p.map((v, idx) => idx === i ? !v : v));
  const toggleEvent = (i) => setSelEvents((p) => p.map((v, idx) => idx === i ? !v : v));

  const finish = (accept) => {
    if (!accept) { update((prev) => ({ ...prev, onboarded: true })); return; }
    update((prev) => {
      const goalIdByKey = {};
      const goals = [...prev.goals];
      SUGGESTED_GOALS.forEach((g) => {
        if (!selGoals[g.key]) return;
        const id = uid(); goalIdByKey[g.key] = id;
        goals.push({ id, name: g.name, term: g.term, objectives: g.objectives.map((t) => ({ id: uid(), text: t, done: false })), createdAt: todayStr() });
      });
      const habits = [...prev.habits];
      SUGGESTED_HABITS.forEach((h, i) => {
        if (!selHabits[i]) return;
        habits.push({
          id: uid(), name: h.name, type: h.type, freqPerWeek: h.freqPerWeek || 1, days: h.days || [],
          measurement: h.measurement, unit: h.unit || "", essential: h.essential,
          goalId: goalIdByKey[h.goalKey] || null, active: true, createdAt: todayStr(),
        });
      });
      const events = [...prev.events];
      SUGGESTED_EVENTS.forEach((e, i) => { if (selEvents[i]) events.push({ id: uid(), ...e, date: null }); });
      return { ...prev, goals, habits, events, onboarded: true };
    });
  };

  const Check2 = ({ checked, onClick, children, sub }) => (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: "10px 12px",
      borderRadius: 12, border: `1px solid ${checked ? "#2C6360" : "#E6E2DA"}`, background: checked ? "#E4EEEC" : "#FFFFFF",
      marginBottom: 8, cursor: "pointer",
    }}>
      <div style={{ marginTop: 1 }}>{checked ? <CircleCheck size={18} color="#2C6360" /> : <Circle size={18} color="#9C968C" />}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{children}</div>
        {sub && <div style={{ fontSize: 12, color: "#9C968C" }}>{sub}</div>}
      </div>
    </button>
  );

  return (
    <div style={{ padding: "24px 18px 40px" }}>
      <Sparkles size={26} color="#2C6360" />
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 6px" }}>Con lo que me has contado</h1>
      <p style={{ fontSize: 14, color: "#6B655C", marginTop: 0, marginBottom: 20 }}>
        Te propongo empezar con esto. Puedes destildar lo que no quieras, y siempre podrás agregar, cambiar o eliminar cosas después.
      </p>

      <SectionTitle text="Metas" />
      {SUGGESTED_GOALS.map((g) => (
        <Check2 key={g.key} checked={selGoals[g.key]} onClick={() => toggleGoal(g.key)}>{g.name}</Check2>
      ))}

      <SectionTitle text="Hábitos" />
      {SUGGESTED_HABITS.map((h, i) => {
        const freq = h.type === "daily" ? "Todos los días" : `${h.freqPerWeek} veces por semana`;
        return <Check2 key={i} checked={selHabits[i]} onClick={() => toggleHabit(i)} sub={freq}>{h.name}</Check2>;
      })}

      <SectionTitle text="Eventos fijos que mencionaste" />
      {SUGGESTED_EVENTS.map((e, i) => (
        <Check2 key={i} checked={selEvents[i]} onClick={() => toggleEvent(i)} sub={`${DAY_LABELS[e.day]} · ${e.start}–${e.end}`}>{e.name}</Check2>
      ))}
      <p style={{ fontSize: 12, color: "#9C968C", marginTop: 4 }}>No tengo las horas exactas de tus clases — agrégalas en Agenda cuando quieras.</p>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <PrimaryBtn onClick={() => finish(true)} style={{ flex: 1, justifyContent: "center" }}><Check size={16} /> Aceptar seleccionados</PrimaryBtn>
        <GhostBtn onClick={() => finish(false)}>Omitir por ahora</GhostBtn>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("hoy");
  const [now, setNow] = useState(new Date());
  const dataRef = useRef(null);

  useEffect(() => {
    loadData().then((d) => { setData(d); dataRef.current = d; });
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const update = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dataRef.current = next;
      persist(next);
      return next;
    });
  }, []);

  if (!data) {
    return (
      <div style={wrap}>
        <div style={{ padding: 40, textAlign: "center", color: "#9C968C" }}>Cargando tus datos…</div>
      </div>
    );
  }

  const today = todayStr();
  const isDifficultToday = data.difficultDays.includes(today);

  if (!data.onboarded) {
    return (
      <div style={wrap}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; }
          body, .m-app { font-family: 'Manrope', -apple-system, sans-serif; }
          button { font-family: inherit; }
        `}</style>
        <div className="m-app" style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", background: "#FAFAF7" }}>
          <Onboarding update={update} />
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body, .m-app { font-family: 'Manrope', -apple-system, sans-serif; }
        button { font-family: inherit; }
        ::selection { background: #2C636033; }
      `}</style>
      <div className="m-app" style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 84, minHeight: "100vh", background: "#FAFAF7" }}>
        {tab === "hoy" && <HoyTab data={data} update={update} now={now} isDifficultToday={isDifficultToday} />}
        {tab === "agenda" && <AgendaTab data={data} update={update} />}
        {tab === "habitos" && <HabitosTab data={data} update={update} today={today} />}
        {tab === "tareas" && <TareasTab data={data} update={update} today={today} />}
        {tab === "metas" && <MetasTab data={data} update={update} />}
        {tab === "animo" && <AnimoTab data={data} update={update} today={today} />}
        {tab === "estadisticas" && <EstadisticasTab data={data} />}
        {tab === "asistente" && <AsistenteTab data={data} />}
        <NavBar tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

const wrap = { background: "#FAFAF7", minHeight: "100vh", color: "#262420" };

function NavBar({ tab, setTab }) {
  const items = [
    { id: "hoy", label: "Hoy", icon: Home },
    { id: "agenda", label: "Agenda", icon: CalendarClock },
    { id: "habitos", label: "Hábitos", icon: Repeat },
    { id: "tareas", label: "Tareas", icon: ClipboardList },
    { id: "metas", label: "Metas", icon: Target },
    { id: "animo", label: "Ánimo", icon: Smile },
    { id: "estadisticas", label: "Progreso", icon: TrendingUp },
    { id: "asistente", label: "Asistente", icon: MessageCircle },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 460,
      background: "#FFFFFF", borderTop: "1px solid #E6E2DA", display: "flex", padding: "6px 2px 9px",
    }}>
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none",
            border: "none", cursor: "pointer", color: active ? "#2C6360" : "#9C968C", padding: "6px 0",
          }}>
            <Icon size={18} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- HOY ---------- */
function HoyTab({ data, update, now, isDifficultToday }) {
  const today = todayStr();
  const dueHabits = data.habits.filter((h) => h.active && isHabitDueToday(h, today));
  const visibleHabits = isDifficultToday ? dueHabits.filter((h) => h.essential) : dueHabits;
  const todaysTasks = data.tasks.filter((t) => t.date === today);
  const sortedTasks = [...todaysTasks].sort((a, b) => PRIORITY[a.priority].order - PRIORITY[b.priority].order);

  const habitDone = (h) => data.habitLogs.some((l) => l.habitId === h.id && l.date === today && l.completed);
  const totalItems = visibleHabits.length + todaysTasks.length;
  const doneItems = visibleHabits.filter(habitDone).length + todaysTasks.filter((t) => t.completed).length;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  const toggleHabit = (h) => {
    update((prev) => {
      const exists = prev.habitLogs.find((l) => l.habitId === h.id && l.date === today);
      let habitLogs;
      if (exists) {
        habitLogs = prev.habitLogs.filter((l) => l.id !== exists.id);
      } else {
        habitLogs = [...prev.habitLogs, { id: uid(), habitId: h.id, date: today, completed: true, value: null }];
      }
      return { ...prev, habitLogs };
    });
  };
  const toggleTask = (t) => {
    update((prev) => ({ ...prev, tasks: prev.tasks.map((x) => x.id === t.id ? { ...x, completed: !x.completed } : x) }));
  };
  const toggleDifficult = () => {
    update((prev) => {
      const has = prev.difficultDays.includes(today);
      return { ...prev, difficultDays: has ? prev.difficultDays.filter((d) => d !== today) : [...prev.difficultDays, today] };
    });
  };

  const timeStr = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ padding: "20px 18px" }}>
      <div style={{ fontSize: 13, color: "#9C968C", marginBottom: 2, textTransform: "capitalize" }}>{dateStr}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Hoy</h1>
        <span style={{ fontSize: 15, color: "#6B655C", fontWeight: 600 }}>{timeStr}</span>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 8 }}>
          <span>Progreso del día</span><span>{totalItems ? `${doneItems}/${totalItems}` : "sin plan aún"}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "#E4EEEC", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#2C6360", borderRadius: 999, transition: "width .3s" }} />
        </div>
      </Card>

      <button onClick={toggleDifficult} style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        borderRadius: 14, border: `1px solid ${isDifficultToday ? "#B1503B" : "#E6E2DA"}`,
        background: isDifficultToday ? "#B1503B12" : "#FFFFFF", marginBottom: 20, cursor: "pointer",
      }}>
        <AlertTriangle size={18} color={isDifficultToday ? "#B1503B" : "#9C968C"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: isDifficultToday ? "#B1503B" : "#262420" }}>
            {isDifficultToday ? "Día difícil activado" : "Hoy es un día difícil"}
          </div>
          <div style={{ fontSize: 12, color: "#9C968C" }}>
            {isDifficultToday ? "Solo se muestran tus hábitos esenciales. Tu progreso no se rompe." : "Muestra solo lo esencial y no afecta tus estadísticas"}
          </div>
        </div>
      </button>

      <SectionTitle text="Hábitos de hoy" />
      {visibleHabits.length === 0 && <EmptyState text={isDifficultToday ? "No marcaste hábitos como esenciales todavía." : "No tienes hábitos programados para hoy."} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {visibleHabits.map((h) => {
          const done = habitDone(h);
          const weekly = h.type === "weekly_count" ? weeklyCompletedCount(h, data.habitLogs, today) : null;
          return (
            <button key={h.id} onClick={() => toggleHabit(h)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14,
              border: "1px solid #E6E2DA", background: done ? "#E4EEEC" : "#FFFFFF", cursor: "pointer", textAlign: "left",
            }}>
              {done ? <CircleCheck size={22} color="#2C6360" /> : <Circle size={22} color="#9C968C" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, textDecoration: done ? "line-through" : "none", color: done ? "#2C6360" : "#262420" }}>{h.name}</div>
                {weekly !== null && <div style={{ fontSize: 12, color: "#9C968C" }}>{weekly}/{h.freqPerWeek} esta semana</div>}
              </div>
            </button>
          );
        })}
      </div>

      <SectionTitle text="Tareas de hoy" />
      {sortedTasks.length === 0 && <EmptyState text="No tienes tareas para hoy." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedTasks.map((t) => (
          <button key={t.id} onClick={() => toggleTask(t)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14,
            border: "1px solid #E6E2DA", background: t.completed ? "#E4EEEC" : "#FFFFFF", cursor: "pointer", textAlign: "left",
          }}>
            {t.completed ? <CircleCheck size={22} color="#2C6360" /> : <Circle size={22} color="#9C968C" />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, textDecoration: t.completed ? "line-through" : "none" }}>{t.name}</div>
              {t.time && <div style={{ fontSize: 12, color: "#9C968C" }}>{t.time}</div>}
            </div>
            <Pill color={PRIORITY[t.priority].color}>{PRIORITY[t.priority].label}</Pill>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ text }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: "#262420", margin: "18px 0 10px" }}>{text}</div>;
}

/* ---------- AGENDA ---------- */
function AgendaTab({ data, update }) {
  const [dateStr, setDateStr] = useState(todayStr());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [overflow, setOverflow] = useState([]);
  const isToday = dateStr === todayStr();

  const addOrEdit = (ev) => {
    update((prev) => {
      if (editing) return { ...prev, events: prev.events.map((x) => x.id === editing.id ? ev : x) };
      return { ...prev, events: [...prev.events, ev] };
    });
    setShowForm(false); setEditing(null);
  };
  const removeEvent = (ev) => update((prev) => ({ ...prev, events: prev.events.filter((x) => x.id !== ev.id) }));

  const dayEvents = data.events.filter((ev) => eventDueOn(ev, dateStr)).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  const timedTasks = data.tasks.filter((t) => t.date === dateStr && t.time && !t.completed);
  const untimedTasks = data.tasks.filter((t) => t.date === dateStr && !t.time && !t.completed);
  const dueHabits = data.habits.filter((h) => h.active && isHabitDueToday(h, dateStr));

  const blocks = [
    ...dayEvents.map((e) => ({ kind: "evento", start: e.start, end: e.end, name: e.name, id: e.id })),
    ...timedTasks.map((t) => ({ kind: "tarea", start: t.time, end: minToTime(timeToMin(t.time) + (Number(t.duration) || 30)), name: t.name, id: t.id, priority: t.priority })),
  ].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  const changeDay = (delta) => {
    const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + delta); setDateStr(toISO(d));
    setProposal(null); setOverflow([]);
  };

  const organizarDia = () => {
    const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : 6 * 60;
    const dayStart = Math.max(nowMin, 6 * 60);
    const dayEnd = 22 * 60; // regla de las 10:00 p. m.
    const busy = dayEvents.map((e) => [timeToMin(e.start), timeToMin(e.end)]).sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let cursor = dayStart;
    busy.forEach(([s, e]) => { if (s > cursor) gaps.push([cursor, s]); cursor = Math.max(cursor, e); });
    if (cursor < dayEnd) gaps.push([cursor, dayEnd]);

    const candidates = data.tasks
      .filter((t) => t.date === dateStr && !t.time && !t.completed)
      .sort((a, b) => PRIORITY[a.priority].order - PRIORITY[b.priority].order);

    const props = [];
    const left = [];
    let gi = 0, gcursor = gaps[0] ? gaps[0][0] : dayEnd;
    for (const t of candidates) {
      const dur = Number(t.duration) || 30;
      while (gi < gaps.length && gcursor + dur > gaps[gi][1]) { gi++; gcursor = gaps[gi] ? gaps[gi][0] : dayEnd; }
      if (gi >= gaps.length || gcursor + dur > dayEnd) { left.push(t); continue; }
      props.push({ taskId: t.id, name: t.name, start: minToTime(gcursor), end: minToTime(gcursor + dur) });
      gcursor += dur;
    }
    setProposal(props); setOverflow(left);
  };

  const aplicarPropuesta = () => {
    update((prev) => ({ ...prev, tasks: prev.tasks.map((t) => { const p = proposal.find((x) => x.taskId === t.id); return p ? { ...t, time: p.start } : t; }) }));
    setProposal(null); setOverflow([]);
  };
  const moverOverflowManana = () => {
    const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + 1); const nd = toISO(d);
    update((prev) => ({ ...prev, tasks: prev.tasks.map((t) => overflow.find((o) => o.id === t.id) ? { ...t, date: nd } : t) }));
    setOverflow([]);
  };

  return (
    <div style={{ padding: "20px 18px" }}>
      <Header title="Agenda" onAdd={() => { setEditing(null); setShowForm(true); }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <IconBtn onClick={() => changeDay(-1)}><ChevronLeft size={16} /></IconBtn>
        <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>
          {new Date(dateStr + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
          {isToday && <span style={{ color: "#2C6360" }}> · hoy</span>}
        </div>
        <IconBtn onClick={() => changeDay(1)}><ChevronRight size={16} /></IconBtn>
      </div>

      {showForm && <EventForm initial={editing} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={addOrEdit} />}

      <GhostBtn onClick={organizarDia} style={{ width: "100%", justifyContent: "center", marginBottom: 16, borderColor: "#2C6360", color: "#2C6360" }}>
        <Sparkles size={15} /> Organiza mi día
      </GhostBtn>

      {proposal && (
        <Card style={{ marginBottom: 16, background: "#E4EEEC" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Propuesta ({proposal.length} tarea{proposal.length !== 1 ? "s" : ""} en espacios libres)</div>
          {proposal.length === 0 && <div style={{ fontSize: 13, color: "#6B655C", marginBottom: 8 }}>No encontré tareas sin hora pendientes para este día.</div>}
          {proposal.map((p, i) => (
            <div key={p.taskId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input type="time" value={p.start} onChange={(e) => {
                const start = e.target.value; const dur = timeToMin(p.end) - timeToMin(p.start);
                setProposal((prev) => prev.map((x, idx) => idx === i ? { ...x, start, end: minToTime(timeToMin(start) + dur) } : x));
              }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #E6E2DA", fontSize: 13 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: "#6B655C" }}>{p.end}</span>
            </div>
          ))}
          {overflow.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#B1503B12", fontSize: 12, color: "#B1503B" }}>
              {overflow.length} tarea{overflow.length !== 1 ? "s" : ""} quedaron pendientes. No se programan después de las 10:00 p. m.
              <div style={{ marginTop: 6 }}><GhostBtn onClick={moverOverflowManana} style={{ fontSize: 12, padding: "6px 10px" }}>Mover a mañana</GhostBtn></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <PrimaryBtn onClick={aplicarPropuesta}><Check size={14} /> Aceptar</PrimaryBtn>
            <GhostBtn onClick={() => { setProposal(null); setOverflow([]); }}><X size={14} /> Mantener como está</GhostBtn>
          </div>
        </Card>
      )}

      <SectionTitle text="Horario" />
      {blocks.length === 0 && <EmptyState text="No tienes eventos ni tareas con hora para este día." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {blocks.map((b) => (
          <div key={b.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 46, fontSize: 12, fontWeight: 700, color: "#6B655C", textAlign: "right" }}>{b.start}</div>
            <div style={{
              flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #E6E2DA",
              background: b.kind === "evento" ? "#FFFFFF" : "#2C636012", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{b.name}</span>
              {b.kind === "tarea" && <Pill color={PRIORITY[b.priority].color}>{PRIORITY[b.priority].label}</Pill>}
              {b.kind === "evento" && (
                <>
                  <IconBtn title="Editar" onClick={() => { setEditing(dayEvents.find((e) => e.id === b.id)); setShowForm(true); }}><Pencil size={12} /></IconBtn>
                  <IconBtn title="Eliminar" onClick={() => removeEvent({ id: b.id })}><Trash2 size={12} /></IconBtn>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {(untimedTasks.length > 0 || dueHabits.length > 0) && <SectionTitle text="Sin horario fijo" />}
      {untimedTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {untimedTasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 2px" }}>
              <ClipboardList size={14} color="#9C968C" /><span style={{ flex: 1 }}>{t.name}</span>
              <Pill color={PRIORITY[t.priority].color}>{PRIORITY[t.priority].label}</Pill>
            </div>
          ))}
        </div>
      )}
      {dueHabits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dueHabits.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 2px" }}>
              <Repeat size={14} color="#9C968C" /><span style={{ flex: 1 }}>{h.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [recurring, setRecurring] = useState(initial ? !initial.date : true);
  const [day, setDay] = useState(initial?.day || "MO");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [start, setStart] = useState(initial?.start || "08:00");
  const [end, setEnd] = useState(initial?.end || "09:00");

  const save = () => {
    if (!name.trim()) return;
    onSave({ id: initial?.id || uid(), name: name.trim(), start, end, day: recurring ? day : null, date: recurring ? null : date });
  };

  return (
    <Card style={{ marginBottom: 16, background: "#FAFAF7" }}>
      <TextField label="Nombre del evento" value={name} onChange={setName} placeholder="Ej. Clase de Anatomía" />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setRecurring(true)} style={tabToggle(recurring)}>Se repite cada semana</button>
        <button onClick={() => setRecurring(false)} style={tabToggle(!recurring)}>Una sola fecha</button>
      </div>
      {recurring ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Día</div>
          <div style={{ display: "flex", gap: 6 }}>
            {DAY_CODES.map((d) => (
              <button key={d} onClick={() => setDay(d)} style={{
                width: 36, height: 36, borderRadius: 10, border: `1px solid ${day === d ? "#2C6360" : "#E6E2DA"}`,
                background: day === d ? "#2C6360" : "#FFFFFF", color: day === d ? "#fff" : "#6B655C", fontWeight: 700, cursor: "pointer",
              }}>{DAY_LABELS[d]}</button>
            ))}
          </div>
        </div>
      ) : <TextField label="Fecha" type="date" value={date} onChange={setDate} />}
      <div style={{ display: "flex", gap: 10 }}>
        <TextField label="Inicio" type="time" value={start} onChange={setStart} style={{ flex: 1 }} />
        <TextField label="Fin" type="time" value={end} onChange={setEnd} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <PrimaryBtn onClick={save}><Check size={15} /> Guardar</PrimaryBtn>
        <GhostBtn onClick={onCancel}><X size={15} /> Cancelar</GhostBtn>
      </div>
    </Card>
  );
}

/* ---------- HÁBITOS ---------- */
function HabitosTab({ data, update, today }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const addOrEdit = (habit) => {
    update((prev) => {
      if (editing) return { ...prev, habits: prev.habits.map((h) => h.id === editing.id ? habit : h) };
      return { ...prev, habits: [...prev.habits, habit] };
    });
    setShowForm(false); setEditing(null);
  };
  const toggleActive = (h) => update((prev) => ({ ...prev, habits: prev.habits.map((x) => x.id === h.id ? { ...x, active: !x.active } : x) }));
  const removeHabit = (h) => {
    if (!confirm(`¿Eliminar "${h.name}"? Se perderá su historial.`)) return;
    update((prev) => ({ ...prev, habits: prev.habits.filter((x) => x.id !== h.id), habitLogs: prev.habitLogs.filter((l) => l.habitId !== h.id) }));
  };

  const active = data.habits.filter((h) => h.active);
  const paused = data.habits.filter((h) => !h.active);
  const many = active.length >= 12;

  return (
    <div style={{ padding: "20px 18px" }}>
      <Header title="Hábitos" onAdd={() => { setEditing(null); setShowForm(true); }} />
      {many && (
        <Card style={{ marginBottom: 14, background: "#C68A3D12", border: "1px solid #C68A3D40" }}>
          <div style={{ fontSize: 13, color: "#8A5F27" }}>Tienes {active.length} hábitos activos. Con tantos a la vez es más difícil ser constante — considera pausar los que no son prioridad ahora.</div>
        </Card>
      )}
      {showForm && <HabitForm initial={editing} goals={data.goals} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={addOrEdit} />}

      {active.length === 0 && !showForm && <EmptyState text="Aún no tienes hábitos. Agrega el primero cuando quieras." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active.map((h) => (
          <HabitRow key={h.id} habit={h} logs={data.habitLogs} today={today}
            onEdit={() => { setEditing(h); setShowForm(true); }} onPause={() => toggleActive(h)} onDelete={() => removeHabit(h)} />
        ))}
      </div>

      {paused.length > 0 && (
        <>
          <SectionTitle text="En pausa" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paused.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: "1px dashed #E6E2DA", opacity: 0.7 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{h.name}</div>
                <IconBtn title="Reanudar" onClick={() => toggleActive(h)}><Play size={15} /></IconBtn>
                <IconBtn title="Eliminar" onClick={() => removeHabit(h)}><Trash2 size={15} /></IconBtn>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HabitRow({ habit: h, logs, today, onEdit, onPause, onDelete }) {
  const weekly = h.type === "weekly_count" ? weeklyCompletedCount(h, logs, today) : null;
  const freqText =
    h.type === "daily" ? "Todos los días" :
    h.type === "specific_days" ? h.days.map((d) => DAY_LABELS[d]).join(" · ") :
    `${weekly}/${h.freqPerWeek} veces por semana`;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{h.name}</div>
          <div style={{ fontSize: 12, color: "#9C968C", marginTop: 2 }}>{freqText}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {h.essential && <Pill color="#B1503B">Esencial</Pill>}
            {h.measurement !== "boolean" && <Pill color="#2C6360">{h.measurement}{h.unit ? ` · ${h.unit}` : ""}</Pill>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn title="Editar" onClick={onEdit}><Pencil size={14} /></IconBtn>
          <IconBtn title="Pausar" onClick={onPause}><Pause size={14} /></IconBtn>
          <IconBtn title="Eliminar" onClick={onDelete}><Trash2 size={14} /></IconBtn>
        </div>
      </div>
    </Card>
  );
}

function HabitForm({ initial, goals, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "daily");
  const [freqPerWeek, setFreqPerWeek] = useState(initial?.freqPerWeek || 3);
  const [days, setDays] = useState(initial?.days || []);
  const [measurement, setMeasurement] = useState(initial?.measurement || "boolean");
  const [unit, setUnit] = useState(initial?.unit || "");
  const [essential, setEssential] = useState(initial?.essential || false);
  const [goalId, setGoalId] = useState(initial?.goalId || "");

  const toggleDay = (d) => setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || uid(), name: name.trim(), type, freqPerWeek: Number(freqPerWeek) || 1,
      days, measurement, unit: unit.trim(), essential, goalId: goalId || null,
      active: initial?.active ?? true, createdAt: initial?.createdAt || todayStr(),
    });
  };

  return (
    <Card style={{ marginBottom: 16, background: "#FAFAF7" }}>
      <TextField label="Nombre del hábito" value={name} onChange={setName} placeholder="Ej. Entrenar" />
      <Select label="Frecuencia" value={type} onChange={setType} options={[
        { value: "daily", label: "Todos los días" },
        { value: "weekly_count", label: "Cierto número de veces por semana" },
        { value: "specific_days", label: "Días específicos" },
      ]} />
      {type === "weekly_count" && <TextField label="Veces por semana" type="number" value={freqPerWeek} onChange={setFreqPerWeek} />}
      {type === "specific_days" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Días</div>
          <div style={{ display: "flex", gap: 6 }}>
            {DAY_CODES.map((d) => (
              <button key={d} onClick={() => toggleDay(d)} style={{
                width: 36, height: 36, borderRadius: 10, border: `1px solid ${days.includes(d) ? "#2C6360" : "#E6E2DA"}`,
                background: days.includes(d) ? "#2C6360" : "#FFFFFF", color: days.includes(d) ? "#fff" : "#6B655C", fontWeight: 700, cursor: "pointer",
              }}>{DAY_LABELS[d]}</button>
            ))}
          </div>
        </div>
      )}
      <Select label="Cómo se registra" value={measurement} onChange={setMeasurement} options={[
        { value: "boolean", label: "Sí / No" },
        { value: "cantidad", label: "Cantidad" },
        { value: "duracion", label: "Duración" },
        { value: "numerico", label: "Valor numérico" },
      ]} />
      {measurement !== "boolean" && <TextField label="Unidad (opcional)" value={unit} onChange={setUnit} placeholder="Ej. minutos, vasos, horas" />}
      {goals.length > 0 && (
        <Select label="Meta relacionada (opcional)" value={goalId} onChange={setGoalId}
          options={[{ value: "", label: "Ninguna" }, ...goals.map((g) => ({ value: g.id, label: g.name }))]} />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#6B655C" }}>
        <input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
        Marcar como esencial (se mantiene en días difíciles)
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <PrimaryBtn onClick={save}><Check size={15} /> Guardar</PrimaryBtn>
        <GhostBtn onClick={onCancel}><X size={15} /> Cancelar</GhostBtn>
      </div>
    </Card>
  );
}

/* ---------- TAREAS ---------- */
function TareasTab({ data, update, today }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const addOrEdit = (task) => {
    update((prev) => {
      if (editing) return { ...prev, tasks: prev.tasks.map((t) => t.id === editing.id ? task : t) };
      return { ...prev, tasks: [...prev.tasks, task] };
    });
    setShowForm(false); setEditing(null);
  };
  const toggleDone = (t) => update((prev) => ({ ...prev, tasks: prev.tasks.map((x) => x.id === t.id ? { ...x, completed: !x.completed } : x) }));
  const removeTask = (t) => update((prev) => ({ ...prev, tasks: prev.tasks.filter((x) => x.id !== t.id) }));

  const pending = data.tasks.filter((t) => !t.completed).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || PRIORITY[a.priority].order - PRIORITY[b.priority].order);
  const done = data.tasks.filter((t) => t.completed);
  const groups = { [`Hoy`]: [], "Próximas": [], "Sin fecha": [] };
  pending.forEach((t) => {
    if (!t.date) groups["Sin fecha"].push(t);
    else if (t.date === today) groups["Hoy"].push(t);
    else groups["Próximas"].push(t);
  });

  return (
    <div style={{ padding: "20px 18px" }}>
      <Header title="Tareas" onAdd={() => { setEditing(null); setShowForm(true); }} />
      {showForm && <TaskForm initial={editing} goals={data.goals} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={addOrEdit} />}
      {pending.length === 0 && !showForm && <EmptyState text="No tienes tareas pendientes." />}
      {Object.entries(groups).map(([label, list]) => list.length > 0 && (
        <div key={label}>
          <SectionTitle text={label} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {list.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t)} onEdit={() => { setEditing(t); setShowForm(true); }} onDelete={() => removeTask(t)} />)}
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <SectionTitle text="Completadas" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {done.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t)} onEdit={() => { setEditing(t); setShowForm(true); }} onDelete={() => removeTask(t)} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ task: t, onToggle, onEdit, onDelete }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {t.completed ? <CircleCheck size={22} color="#2C6360" /> : <Circle size={22} color="#9C968C" />}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, textDecoration: t.completed ? "line-through" : "none" }}>{t.name}</div>
          <div style={{ fontSize: 12, color: "#9C968C", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
            {t.date && <span>{t.date}{t.time ? ` · ${t.time}` : ""}</span>}
            {t.category && <span>· {t.category}</span>}
          </div>
        </div>
        <Pill color={PRIORITY[t.priority].color}>{PRIORITY[t.priority].label}</Pill>
        <IconBtn title="Editar" onClick={onEdit}><Pencil size={14} /></IconBtn>
        <IconBtn title="Eliminar" onClick={onDelete}><Trash2 size={14} /></IconBtn>
      </div>
    </Card>
  );
}

function TaskForm({ initial, goals, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [time, setTime] = useState(initial?.time || "");
  const [priority, setPriority] = useState(initial?.priority || "importante");
  const [duration, setDuration] = useState(initial?.duration || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [goalId, setGoalId] = useState(initial?.goalId || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || uid(), name: name.trim(), date: date || null, time: time || null, priority,
      duration: duration || null, category: category.trim(), goalId: goalId || null, notes: notes.trim(),
      completed: initial?.completed || false, createdAt: initial?.createdAt || todayStr(),
    });
  };

  return (
    <Card style={{ marginBottom: 16, background: "#FAFAF7" }}>
      <TextField label="Nombre de la tarea" value={name} onChange={setName} placeholder="Ej. Entregar trabajo de Biomarcadores" />
      <div style={{ display: "flex", gap: 10 }}>
        <TextField label="Fecha" type="date" value={date} onChange={setDate} style={{ flex: 1 }} />
        <TextField label="Hora (opcional)" type="time" value={time} onChange={setTime} style={{ flex: 1 }} />
      </div>
      <Select label="Prioridad" value={priority} onChange={setPriority} options={[
        { value: "esencial", label: "Esencial" }, { value: "importante", label: "Importante" }, { value: "si_tiempo", label: "Si tengo tiempo" },
      ]} />
      <div style={{ display: "flex", gap: 10 }}>
        <TextField label="Duración estimada (min)" type="number" value={duration} onChange={setDuration} style={{ flex: 1 }} />
        <TextField label="Categoría" value={category} onChange={setCategory} placeholder="Ej. Universidad" style={{ flex: 1 }} />
      </div>
      {goals.length > 0 && (
        <Select label="Meta relacionada (opcional)" value={goalId} onChange={setGoalId}
          options={[{ value: "", label: "Ninguna" }, ...goals.map((g) => ({ value: g.id, label: g.name }))]} />
      )}
      <TextField label="Notas (opcional)" value={notes} onChange={setNotes} />
      <div style={{ display: "flex", gap: 10 }}>
        <PrimaryBtn onClick={save}><Check size={15} /> Guardar</PrimaryBtn>
        <GhostBtn onClick={onCancel}><X size={15} /> Cancelar</GhostBtn>
      </div>
    </Card>
  );
}

/* ---------- METAS ---------- */
function MetasTab({ data, update }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const addOrEdit = (goal) => {
    update((prev) => {
      if (editing) return { ...prev, goals: prev.goals.map((g) => g.id === editing.id ? goal : g) };
      return { ...prev, goals: [...prev.goals, goal] };
    });
    setShowForm(false); setEditing(null);
  };
  const removeGoal = (g) => {
    if (!confirm(`¿Eliminar la meta "${g.name}"? Los hábitos y tareas no se borrarán, solo se desvincularán.`)) return;
    update((prev) => ({
      ...prev, goals: prev.goals.filter((x) => x.id !== g.id),
      habits: prev.habits.map((h) => h.goalId === g.id ? { ...h, goalId: null } : h),
      tasks: prev.tasks.map((t) => t.goalId === g.id ? { ...t, goalId: null } : t),
    }));
  };
  const toggleObjective = (g, objId) => update((prev) => ({
    ...prev, goals: prev.goals.map((x) => x.id !== g.id ? x : { ...x, objectives: x.objectives.map((o) => o.id === objId ? { ...o, done: !o.done } : o) }),
  }));

  const termLabel = { corto: "Corto plazo", mediano: "Mediano plazo", largo: "Largo plazo" };

  return (
    <div style={{ padding: "20px 18px" }}>
      <Header title="Metas" onAdd={() => { setEditing(null); setShowForm(true); }} />
      {showForm && <GoalForm initial={editing} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={addOrEdit} />}
      {data.goals.length === 0 && !showForm && <EmptyState text="Aún no tienes metas. Agrega la primera cuando quieras." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.goals.map((g) => {
          const habits = data.habits.filter((h) => h.goalId === g.id);
          const tasks = data.tasks.filter((t) => t.goalId === g.id);
          const objTotal = g.objectives.length;
          const objDone = g.objectives.filter((o) => o.done).length;
          const isOpen = expanded === g.id;
          return (
            <Card key={g.id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : g.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Pill color="#2C6360">{termLabel[g.term]}</Pill>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: "#9C968C", marginTop: 2 }}>
                    {habits.length} hábito{habits.length !== 1 ? "s" : ""} · {tasks.length} tarea{tasks.length !== 1 ? "s" : ""}
                    {objTotal > 0 ? ` · ${objDone}/${objTotal} objetivos` : ""}
                  </div>
                </div>
                <IconBtn title="Editar" onClick={() => { setEditing(g); setShowForm(true); }}><Pencil size={14} /></IconBtn>
                <IconBtn title="Eliminar" onClick={() => removeGoal(g)}><Trash2 size={14} /></IconBtn>
                <IconBtn title={isOpen ? "Contraer" : "Expandir"} onClick={() => setExpanded(isOpen ? null : g.id)}>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </IconBtn>
              </div>
              {isOpen && (
                <div style={{ marginTop: 14, borderTop: "1px solid #E6E2DA", paddingTop: 12 }}>
                  {g.objectives.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B655C", marginBottom: 6 }}>Objetivos intermedios</div>
                      {g.objectives.map((o) => (
                        <button key={o.id} onClick={() => toggleObjective(g, o.id)} style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none",
                          border: "none", cursor: "pointer", padding: "5px 0", fontSize: 13,
                        }}>
                          {o.done ? <CircleCheck size={16} color="#2C6360" /> : <Circle size={16} color="#9C968C" />}
                          <span style={{ textDecoration: o.done ? "line-through" : "none", color: o.done ? "#9C968C" : "#262420" }}>{o.text}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {habits.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B655C", margin: "10px 0 4px" }}>Hábitos vinculados</div>
                      {habits.map((h) => <div key={h.id} style={{ fontSize: 13, padding: "3px 0" }}>· {h.name}</div>)}
                    </>
                  )}
                  {tasks.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B655C", margin: "10px 0 4px" }}>Tareas vinculadas</div>
                      {tasks.map((t) => <div key={t.id} style={{ fontSize: 13, padding: "3px 0" }}>· {t.name}</div>)}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GoalForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [term, setTerm] = useState(initial?.term || "mediano");
  const [objectives, setObjectives] = useState(initial?.objectives || []);
  const [newObj, setNewObj] = useState("");

  const addObjective = () => {
    if (!newObj.trim()) return;
    setObjectives((prev) => [...prev, { id: uid(), text: newObj.trim(), done: false }]);
    setNewObj("");
  };
  const removeObjective = (id) => setObjectives((prev) => prev.filter((o) => o.id !== id));

  const save = () => {
    if (!name.trim()) return;
    onSave({ id: initial?.id || uid(), name: name.trim(), term, objectives, createdAt: initial?.createdAt || todayStr() });
  };

  return (
    <Card style={{ marginBottom: 16, background: "#FAFAF7" }}>
      <TextField label="Nombre de la meta" value={name} onChange={setName} placeholder="Ej. Mejorar mi rendimiento académico" />
      <Select label="Plazo" value={term} onChange={setTerm} options={[
        { value: "corto", label: "Corto plazo" }, { value: "mediano", label: "Mediano plazo" }, { value: "largo", label: "Largo plazo" },
      ]} />
      <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Objetivos intermedios (opcional)</div>
      {objectives.map((o) => (
        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 14 }}>· {o.text}</span>
          <IconBtn onClick={() => removeObjective(o.id)}><X size={13} /></IconBtn>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={newObj} onChange={(e) => setNewObj(e.target.value)} placeholder="Ej. Establecer una rutina de estudio"
          onKeyDown={(e) => e.key === "Enter" && addObjective()}
          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid #E6E2DA", fontFamily: "inherit", fontSize: 14 }} />
        <GhostBtn onClick={addObjective}><Plus size={14} /></GhostBtn>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <PrimaryBtn onClick={save}><Check size={15} /> Guardar</PrimaryBtn>
        <GhostBtn onClick={onCancel}><X size={15} /> Cancelar</GhostBtn>
      </div>
    </Card>
  );
}

/* ---------- ÁNIMO ---------- */
function AnimoTab({ data, update, today }) {
  const [period, setPeriod] = useState(new Date().getHours() < 13 ? "morning" : "night");
  const existing = data.moodEntries.find((m) => m.date === today && m.period === period);
  const [mood, setMood] = useState(existing?.mood || 3);
  const [energy, setEnergy] = useState(existing?.energy || 3);
  const [stress, setStress] = useState(existing?.stress || 3);
  const [sleepHours, setSleepHours] = useState(existing?.sleepHours || "");
  const [note, setNote] = useState(existing?.note || "");

  useEffect(() => {
    const e = data.moodEntries.find((m) => m.date === today && m.period === period);
    setMood(e?.mood || 3); setEnergy(e?.energy || 3); setStress(e?.stress || 3); setSleepHours(e?.sleepHours || ""); setNote(e?.note || "");
  }, [period]); // eslint-disable-line

  const save = () => {
    update((prev) => {
      const rest = prev.moodEntries.filter((m) => !(m.date === today && m.period === period));
      return { ...prev, moodEntries: [...rest, { id: uid(), date: today, period, mood, energy, stress, sleepHours: sleepHours || null, note: note.trim() }] };
    });
  };

  const history = [...data.moodEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const scale = (val, set) => (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => set(n)} style={{
          width: 40, height: 40, borderRadius: 10, border: `1px solid ${val === n ? "#2C6360" : "#E6E2DA"}`,
          background: val === n ? "#2C6360" : "#FFFFFF", color: val === n ? "#fff" : "#6B655C", fontWeight: 700, cursor: "pointer",
        }}>{n}</button>
      ))}
    </div>
  );

  return (
    <div style={{ padding: "20px 18px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 16px" }}>Estado de ánimo</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setPeriod("morning")} style={tabToggle(period === "morning")}><Sun size={15} /> Mañana</button>
        <button onClick={() => setPeriod("night")} style={tabToggle(period === "night")}><Moon size={15} /> Noche</button>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Ánimo</div>
          {scale(mood, setMood)}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Energía</div>
          {scale(energy, setEnergy)}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6B655C", marginBottom: 6 }}>Estrés</div>
          {scale(stress, setStress)}
        </div>
        {period === "morning" && <TextField label="Horas de sueño" type="number" value={sleepHours} onChange={setSleepHours} placeholder="Ej. 7.5" />}
        <TextField label={period === "morning" ? "Nota (opcional)" : "¿Cómo estuvo el día? (opcional)"} value={note} onChange={setNote} />
        <PrimaryBtn onClick={save}><Check size={15} /> Guardar registro</PrimaryBtn>
      </Card>

      <SectionTitle text="Historial reciente" />
      {history.length === 0 && <EmptyState text="Todavía no hay registros." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {history.map((m) => (
          <Card key={m.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{m.date} · {m.period === "morning" ? "Mañana" : "Noche"}</span>
              <span style={{ color: "#9C968C" }}>Ánimo {m.mood} · Energía {m.energy} · Estrés {m.stress}{m.sleepHours ? ` · Sueño ${m.sleepHours}h` : ""}</span>
            </div>
            {m.note && <div style={{ fontSize: 13, color: "#6B655C" }}>{m.note}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}
const tabToggle = (active) => ({
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0",
  borderRadius: 10, border: `1px solid ${active ? "#2C6360" : "#E6E2DA"}`, background: active ? "#2C6360" : "#FFFFFF",
  color: active ? "#fff" : "#6B655C", fontWeight: 700, fontSize: 13, cursor: "pointer",
});

/* ---------- ESTADÍSTICAS ---------- */
function StatBox({ label, value, sub }) {
  return (
    <Card style={{ flex: "1 1 45%", minWidth: 130 }}>
      <div style={{ fontSize: 12, color: "#9C968C", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6B655C", marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function EstadisticasTab({ data }) {
  const [mode, setMode] = useState("semana");
  const [weekAnchor, setWeekAnchor] = useState(todayStr());
  const [ym, setYm] = useState(todayStr().slice(0, 7));

  const { start, end } = mode === "semana" ? weekRange(weekAnchor) : monthBounds(ym);
  const stats = computeRangeStats(data, start, end);
  const insights = computeInsights(data);

  const prevRange = mode === "semana"
    ? (() => { const d = new Date(weekAnchor + "T00:00:00"); d.setDate(d.getDate() - 7); return weekRange(toISO(d)); })()
    : monthBounds(shiftMonth(ym, -1));
  const prevStats = computeRangeStats(data, prevRange.start, prevRange.end);
  const delta = stats.overallPct !== null && prevStats.overallPct !== null ? stats.overallPct - prevStats.overallPct : null;

  const chartData = daysArray(start, end).map((d) => {
    const v = stats.perDay[d];
    return { date: d.slice(5), pct: v && v.due ? Math.round((v.done / v.due) * 100) : 0 };
  });

  const shiftWeek = (delta) => { const d = new Date(weekAnchor + "T00:00:00"); d.setDate(d.getDate() + delta * 7); setWeekAnchor(toISO(d)); };

  const DeltaIcon = delta === null ? Minus : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = delta === null ? "#9C968C" : delta > 0 ? "#2C6360" : delta < 0 ? "#B1503B" : "#9C968C";

  return (
    <div style={{ padding: "20px 18px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 16px" }}>Tu progreso</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMode("semana")} style={tabToggle(mode === "semana")}>Semana</button>
        <button onClick={() => setMode("mes")} style={tabToggle(mode === "mes")}>Mes</button>
      </div>

      {mode === "semana" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <IconBtn onClick={() => shiftWeek(-1)}><ChevronLeft size={16} /></IconBtn>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{start} — {end}</div>
          <IconBtn onClick={() => shiftWeek(1)}><ChevronRight size={16} /></IconBtn>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <IconBtn onClick={() => setYm(shiftMonth(ym, -1))}><ChevronLeft size={16} /></IconBtn>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>
            {new Date(ym + "-01T00:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
          </div>
          <IconBtn onClick={() => setYm(shiftMonth(ym, 1))}><ChevronRight size={16} /></IconBtn>
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9C968C", fontWeight: 600 }}>Cumplimiento general</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{stats.overallPct === null ? "—" : `${stats.overallPct}%`}</div>
          </div>
          {delta !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: deltaColor, fontWeight: 700, fontSize: 13 }}>
              <DeltaIcon size={15} /> {Math.abs(delta)}% vs {mode === "semana" ? "semana anterior" : "mes anterior"}
            </div>
          )}
        </div>
        {chartData.some((c) => c.pct > 0) && (
          <div style={{ height: 140, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E2DA" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9C968C" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E6E2DA" }} />
                <Bar dataKey="pct" fill="#2C6360" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <StatBox label="Mejor hábito" value={stats.bestHabit ? `${stats.bestHabit.pct}%` : "—"} sub={stats.bestHabit?.name} />
        <StatBox label="Menor cumplimiento" value={stats.worstHabit ? `${stats.worstHabit.pct}%` : "—"} sub={stats.worstHabit?.name} />
        <StatBox label="Mejor día" value={stats.bestDay ? `${stats.bestDay.pct}%` : "—"} sub={stats.bestDay?.date} />
        <StatBox label="Días difíciles" value={stats.difficultCount} />
        <StatBox label="Sueño promedio" value={stats.avgSleep ? `${stats.avgSleep} h` : "—"} />
        <StatBox label="Ánimo / Energía / Estrés" value={stats.avgMood ? `${stats.avgMood} · ${stats.avgEnergy} · ${stats.avgStress}` : "—"} />
        <StatBox label="Tareas completadas" value={stats.tasksDone} />
        <StatBox label="Tareas pendientes" value={stats.tasksPending} />
      </div>

      {data.goals.length > 0 && (
        <>
          <SectionTitle text="Progreso de metas" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {data.goals.map((g) => {
              const objTotal = g.objectives.length, objDone = g.objectives.filter((o) => o.done).length;
              const linkedHabits = data.habits.filter((h) => h.goalId === g.id).map((h) => stats.perHabit[h.id]).filter(Boolean);
              const linkedPct = linkedHabits.length
                ? Math.round((linkedHabits.reduce((a, h) => a + h.done, 0) / linkedHabits.reduce((a, h) => a + h.due, 0)) * 100) : null;
              return (
                <Card key={g.id}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: "#9C968C", marginTop: 2 }}>
                    {objTotal > 0 && `${objDone}/${objTotal} objetivos`}
                    {objTotal > 0 && linkedPct !== null && " · "}
                    {linkedPct !== null && `${linkedPct}% en hábitos vinculados este periodo`}
                    {objTotal === 0 && linkedPct === null && "Sin hábitos u objetivos vinculados todavía"}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle text="Observaciones" />
      {insights.length === 0 && <EmptyState text="Aún reuniendo datos — vuelve en unos días para ver patrones." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((txt, i) => (
          <Card key={i} style={{ background: "#E4EEEC" }}>
            <div style={{ fontSize: 13, color: "#1F4A47" }}>{txt}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- ASISTENTE ---------- */
const SUGGESTED_PROMPTS = [
  "¿Qué me falta hacer hoy?",
  "¿Cómo me fue esta semana?",
  "Estoy muy cansada, ¿qué debería priorizar?",
  "Muéstrame qué hábitos me cuestan más",
  "¿En qué horario cumplo mejor?",
];

const CHAT_STORAGE_KEY = "mi-organizador:assistant-chat";
async function loadChat() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* aún no existe */ }
  return [];
}
async function persistChat(msgs) {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-40))); } catch (e) { console.error(e); }
}

function AsistenteTab({ data }) {
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKeyState] = useState(() => getApiKey());
  const [showSettings, setShowSettings] = useState(() => !getApiKey());
  const [keyDraft, setKeyDraft] = useState(() => getApiKey());
  const scrollRef = useRef(null);

  useEffect(() => { loadChat().then(setMessages); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);

  const handleSaveKey = () => {
    saveApiKey(keyDraft.trim());
    setApiKeyState(keyDraft.trim());
    if (keyDraft.trim()) setShowSettings(false);
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!apiKey) { setShowSettings(true); return; }
    const next = [...(messages || []), { role: "user", content }];
    setMessages(next); persistChat(next); setInput(""); setLoading(true);
    try {
      const system = `Eres el asistente dentro de una app personal de hábitos, tareas, metas y organización del tiempo. Tu única fuente de verdad son los datos reales que aparecen abajo bajo "DATOS ACTUALES" — nunca inventes hábitos, tareas, metas o cifras que no estén ahí. Cuando encuentres relaciones entre datos (sueño, energía, cumplimiento, horarios), habla de patrones o asociaciones observadas, nunca de causas comprobadas ni de diagnósticos de salud mental. No uses frases vacías de motivación genérica ("¡tú puedes!", "no rompas tu racha"); sé concreta y basada en datos. Tú puedes analizar, sugerir y proponer, pero NUNCA puedes crear, modificar ni eliminar hábitos, tareas o metas directamente — no tienes esa capacidad técnica. Si la usuaria pide un cambio, propónselo con claridad y dile en qué pestaña puede confirmarlo (Hábitos, Tareas, Metas o el botón "Organiza mi día" en Agenda). Responde en español, de forma breve y cálida — esto se lee en un celular, evita párrafos largos.\n\nDATOS ACTUALES:\n${buildContext(data)}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 700,
          system,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.error?.message || `Error ${res.status}`;
        throw new Error(msg);
      }
      const json = await res.json();
      const text2 = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || "No logré generar una respuesta. Intenta de nuevo.";
      const after = [...next, { role: "assistant", content: text2 }];
      setMessages(after); persistChat(after);
    } catch (e) {
      const hint = /401|autenticaci|api.?key/i.test(String(e.message)) ? " Revisa que tu clave de API sea correcta en el ícono de ajustes." : "";
      const after = [...next, { role: "assistant", content: `No pude conectarme en este momento.${hint} (${e.message})` }];
      setMessages(after); persistChat(after);
    } finally {
      setLoading(false);
    }
  };

  if (messages === null) {
    return <div style={{ padding: "40px 18px", textAlign: "center", color: "#9C968C" }}>Cargando…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 84px)" }}>
      <div style={{ padding: "20px 18px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Asistente</h1>
        <IconBtn title="Clave de API" onClick={() => setShowSettings((s) => !s)}><Settings size={15} /></IconBtn>
      </div>
      {showSettings && (
        <Card style={{ margin: "0 18px 12px", background: "#FAFAF7" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <KeyRound size={14} color="#2C6360" />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Clave de API de Anthropic</div>
          </div>
          <p style={{ fontSize: 12, color: "#6B655C", margin: "0 0 8px" }}>
            Se guarda solo en este navegador (localStorage) y nunca sale de tu dispositivo. Consíguela en{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "#2C6360" }}>console.anthropic.com</a>.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid #E6E2DA", fontFamily: "inherit", fontSize: 13 }}
            />
            <PrimaryBtn onClick={handleSaveKey}><Check size={14} /> Guardar</PrimaryBtn>
          </div>
        </Card>
      )}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 18px" }}>
        {messages.length === 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#2C6360", marginBottom: 8 }}>
              <MessageCircle size={18} /><span style={{ fontWeight: 700, fontSize: 14 }}>Hola</span>
            </div>
            <p style={{ fontSize: 13, color: "#6B655C", marginTop: 0 }}>
              Uso tus hábitos, tareas, metas, ánimo y estadísticas reales para responderte — no invento consejos genéricos. Pregúntame lo que quieras.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button key={p} onClick={() => send(p)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #E6E2DA",
                  background: "#FFFFFF", fontSize: 13, color: "#262420", cursor: "pointer",
                }}>{p}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%", padding: "10px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap",
                background: m.role === "user" ? "#2C6360" : "#FFFFFF", color: m.role === "user" ? "#fff" : "#262420",
                border: m.role === "user" ? "none" : "1px solid #E6E2DA",
              }}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 13px", borderRadius: 14, background: "#FFFFFF", border: "1px solid #E6E2DA", fontSize: 13, color: "#9C968C" }}>Pensando…</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 18px 14px", borderTop: "1px solid #E6E2DA", background: "#FAFAF7" }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Escríbeme algo…"
          style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: "1px solid #E6E2DA", fontSize: 14, fontFamily: "inherit" }}
        />
        <button onClick={() => send()} disabled={loading} style={{
          width: 44, height: 44, borderRadius: 12, border: "none", background: "#2C6360", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
        }}><Send size={18} /></button>
      </div>
    </div>
  );
}

function Header({ title, onAdd }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{title}</h1>
      <PrimaryBtn onClick={onAdd}><Plus size={16} /> Nuevo</PrimaryBtn>
    </div>
  );
}
