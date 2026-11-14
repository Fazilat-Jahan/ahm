# Astronaut Health Monitor (AHM): Full Project Spec and AI Context Prompt

> **How to use this file.** Give this whole file to your AI coding assistant (Claude Code, Cursor, etc.) as the project context. Section 0 is the system prompt. Sections 1 to 20 are the source of truth. Build in the order given in Section 18. Do not invent requirements that are not here; if something is missing, make the simplest choice and record it in `DECISIONS.md`.

---

## 0. System Prompt for the AI Coding Agent

```text
You are a senior full-stack engineer and space-health UX designer.
You are building "Astronaut Health Monitor (AHM)": an OFFLINE-FIRST, visual, self-assessment
health tool for astronauts on long-duration missions (spacecraft, space station, rover,
lunar/Mars base).

Stack (fixed, do not change):
- Frontend: Next.js (App Router, TypeScript) + Tailwind CSS, installable PWA,
  React Three Fiber (three.js + drei) for the 3D human body
- Local data on device: IndexedDB via Dexie (the PRIMARY source of truth for the UI)
- Backend: FastAPI (Python 3.11+), SQLAlchemy 2.x + Alembic, Pydantic v2
- Database: Neon (serverless PostgreSQL) as the sync / ground-control store.
  Locally the same backend must also run against SQLite (DATABASE_URL switch) with no internet.

Non-negotiable rules:
1. The app must be fully usable with ZERO internet. Every read and write goes to IndexedDB first.
   The network is an optional background sync, never a dependency of any screen.
2. Never block the UI on a network call. Never show a spinner that waits for the server.
3. Health guidance comes from a deterministic, explainable RULE ENGINE (no LLM at runtime).
   Every status must be traceable to a rule id and a threshold.
4. Thresholds live in a config file, not hard-coded in components, so a flight surgeon can change them.
5. The app is a decision-support / self-assessment tool, NOT a medical device. Always show a short
   disclaimer and always provide an "Contact flight surgeon" path for red status.
6. Colour is never the only signal: pair it with an icon and a text label (accessibility).
7. Write small, typed, testable modules. Add unit tests for the rule engine and the sync logic.
8. Keep the UI calm, high-contrast, and usable with gloves/large touch targets (min 44px).
9. ALL health data is entered MANUALLY by the astronaut through forms. There are no devices, no wearable
   integrations, no OCR, no simulated readings, no "autofill" or "random value" buttons.
10. NEVER hardcode, seed, mock, randomise or fabricate health data in the app, in migrations, or in any
    "demo mode". A fresh install has ZERO astronauts and ZERO logs and must show clear empty states.
    Test fixtures may exist ONLY under tests/ and must never be bundled into the production build.
11. The system is MULTI-ASTRONAUT. Every record belongs to one astronaut identified by full name and a
    unique crew ID. Every screen shows whose data it is ("Name · ID"). An astronaut sees only their own
    data; commander/surgeon roles can see all crew (read-only).
12. The body visual is a real-time 3D model (React Three Fiber): rotatable, zoomable, each body region
    clickable, coloured by that astronaut's latest REAL evaluation. It must work offline (model bundled
    locally, no CDN assets) and fall back to a 2D view only if WebGL is unavailable.

Work in the milestone order in Section 18. After each milestone, state what works, what is
stubbed, and how to run/test it.
```

---

## 1. Product Summary

**Goal.** Help astronauts assess their own health during long missions and give simple, actionable guidance, even when Earth is unreachable.

**Why it is needed.** Long missions (e.g. Mars) mean communication delay of up to ~20+ minutes one way, and no quick evacuation. Crew must monitor and manage their own health, flag problems early, and know when to call the flight surgeon.

**Core loop (daily):**
1. App reminds the astronaut at their chosen time.
2. Shows **yesterday's summary** and checks whether yesterday's advice was followed.
3. Astronaut selects **today's symptoms** (tap checklist).
4. Astronaut enters **measurements** (HR, BP, glucose, temperature, SpO2, sleep, mood, etc.).
5. Rule engine produces **colour-coded status** per indicator plus an overall status.
6. App shows **today's guidance** (2 to 4 concrete actions) and **escalation** if needed.
7. Charts, the 3D body and gamification update.

**Primary users:** each astronaut (self-assessment of their own data). **Secondary:** mission commander and flight surgeon / ground control (read-only crew overview across all astronauts).

### 1.1 Input Method and Data Policy (hard requirements)

- **Input = manual forms only.** The astronaut reads a value from their own medical device or self-observation (cuff, thermometer, glucometer, sleep diary) and types/taps it into the check-in form, then presses **Save / Analyse**. The app never connects to devices.
- **No fake data, anywhere.** No hardcoded numbers, no seed scripts, no random generators, no "simulate reading" button, no sample astronauts. Every number shown on any screen or chart was typed in by a real user. Where there is no data, show an **empty state** (see Section 16).
- **Every astronaut is a separate person with their own identity:** full name, unique **crew ID** (e.g. `AST-001`), role, environment, mission dates, PIN. All logs, symptoms, evaluations, reminders and rewards are stored per astronaut ID and displayed with name + ID.
- **Backdated entries are allowed** (e.g. the astronaut forgot yesterday): the check-in has a date picker limited to the last 14 days, and such entries are labelled "late entry" (`is_backdated = true`). This is still real, user-entered data.
- **After pressing Save:** validate -> store -> run rule engine -> show status, guidance and escalation -> update charts, 3D body, rewards.

**Out of scope:** diagnosing disease, prescribing drugs, any device integration (wearables, Bluetooth, OCR) and any simulated input; data is entered manually only.

---

## 2. The Space-Health Context the App Must Reflect

NASA's Human Research Program groups spaceflight risk into five hazards. The app should connect every indicator to these.

| Hazard | What it does | Indicators it affects | App response |
|---|---|---|---|
| **Space radiation** | Cell/DNA damage, immune change, long-term cancer/cardiovascular risk | Radiation dose (dosimeter), fatigue, nausea, infection signs, temperature | Track cumulative dose; show shelter/storm reminders; immune-symptom checks |
| **Isolation & confinement** | Mood, sleep, cognition, team conflict | Mood, sleep, stress, symptoms (low mood, irritability) | Daily mood check, sleep trend alerts, "talk to crew/counsellor" actions |
| **Distance from Earth** | Delayed or no real-time medical help | All (self-reliance) | Offline-first, clear escalation rules, self-treatment guidance |
| **Altered gravity** (micro-g, Moon 1/6 g, Mars 3/8 g) | Bone loss, muscle atrophy, fluid shift (head/face puffiness, blood pressure changes), cardiovascular deconditioning, vision changes (SANS), motion sickness | HR, BP, weight, exercise minutes, vision symptoms, back pain | Exercise tracker (resistance + cardio), fluid/vision symptom checks |
| **Hostile closed environment** | Air quality (CO2), noise, microbiome, temperature, nutrition limits | SpO2, headache (CO2), temperature, hydration, nutrition, glucose | Cabin-CO2 symptom rule, hydration and nutrition prompts |

**Common resulting conditions to monitor for:** immune dysregulation, bone density loss, cardiovascular events/arrhythmia, inadequate nutrition, sleep disruption, behavioural health conditions (depression, anxiety), space adaptation syndrome (early mission), dehydration, infections, back pain, vision changes.

> Implementation note: put this table's content into a `content/hazards.ts` file and surface it in the "Learn" screens and the tooltips of each indicator.

### 2.1 NASA Risk -> Indicator -> Rule Map

NASA's Human Research Program lists specific health and performance **risks** under the five hazards (https://www.nasa.gov/hrp/risks/). The table below is the contract between NASA's risk list and this app. Every risk is either **Tracked** (inputs + rules), **Partly tracked / Learn** (limited signals plus educational content), or **Out of scope** (with a reason). Hazards also feed off one another, which is why Section 4.4 has multi-signal combination rules.

| # | NASA HRP risk | Main hazard(s) | Tracked via (manual inputs) | Rule ids | Body region | Coverage |
|---|---|---|---|---|---|---|
| 1 | Altered immune system responses | Radiation, isolation, closed environment | temperature, `rash_skin_irritation`, `fever_chills`, `cough_sore_throat`, `fatigue`, stress | `CMB-INF-01`, `CMB-IMM-01` | `region_immune`, `region_skin` | Tracked |
| 2 | Altered sensorimotor and vestibular function | Gravity fields | `dizziness`, `nausea_vomiting`, `ear_congestion` | `CMB-SAM-01` | `region_brain` | Tracked |
| 3 | Cardiovascular adaptations | Gravity fields, radiation | heart rate, BP, `chest_pain`, `palpitations`, `dizziness` | HR and BP bands, `CMB-CHEST-01`, `CMB-CV-01`, `CMB-HYP-01`, `TRD-BP-01`, `TRD-HR-01` | `region_heart` | Tracked |
| 4 | Decompression sickness | Closed/hostile environment (suit pressure) | `eva_today`, `joint_pain`, `muscle_aches`, `tingling_numbness`, `shortness_of_breath`, `dizziness` | `CMB-DCS-01` | `region_muscles`, `region_lungs` | Tracked (EVA days only) |
| 5 | Host-microorganism interactions | Closed environment | `rash_skin_irritation`, `abdominal_pain`, `nausea_vomiting`, temperature | `CMB-INF-01` (partial) | `region_skin`, `region_gut` | Partly tracked + Learn |
| 6 | Hypoxia | Closed environment (habitat/suit oxygen levels) | SpO2, `shortness_of_breath`, `headache`, `difficulty_concentrating`, `fatigue` | SpO2 bands, `CMB-HYPOX-01`, `CMB-CO2-01` | `region_lungs`, `region_brain` | Tracked |
| 7 | Inadequate food and nutrition | Closed environment, distance from Earth | calories, weight, glucose, water intake, `loss_of_appetite` | glucose bands, hydration bands, `TRD-WGT-01` | `region_gut` | Tracked |
| 8 | Injury and compromised performance from spacewalks (EVA) | Closed environment, gravity fields | `eva_today`, `fatigue`, `muscle_aches`, `joint_pain` | `CMB-DCS-01` + fatigue/sleep rules | `region_muscles` | Partly tracked + Learn |
| 9 | Reduced cardiorespiratory and musculoskeletal fitness | Gravity fields | exercise minutes (resistance/cardio), `muscle_aches`, weight | exercise bands, `TRD-EXR-01` | `region_muscles` | Tracked |
| 10 | Spaceflight Associated Neuro-ocular Syndrome (SANS) | Gravity fields (fluid shift), radiation | `vision_changes`, `eye_pain`, `headache`, `facial_puffiness` | `CMB-VIS-01` | `region_eyes` | Tracked (symptoms; no eye imaging) |
| 11 | Spaceflight-induced bone changes | Gravity fields | resistance exercise minutes, `back_pain`, `joint_pain` | exercise bands, `TRD-EXR-01`, `CMB-BACK-01` | `region_spine` | Indirect: bone density cannot be measured by this app, so exercise is used as the protective proxy; explained in Learn |
| 12 | Behavioral changes and psychiatric disorders | Isolation, radiation, distance | mood, stress, sleep, `low_mood`, `anxiety`, `irritability`, safety question | mood bands, `CMB-MENT-01`, `CMB-SAFETY-01`, `TRD-MOOD-01` | `region_mind` | Tracked |
| 13 | Inadequate teamwork | Isolation and confinement | `team_relations` (1 to 5), `irritability` | `TRD-TEAM-01` | `region_mind` | Tracked (optional input) |
| 14 | Inadequate sleep and irregular schedules | Isolation, workload | sleep hours, sleep quality, `insomnia`, `fatigue` | sleep bands, `TRD-SLP-01`, `TRD-SLP-02` | `region_mind` | Tracked |
| 15 | Injury from dynamic loads (launch/landing) | Gravity fields | `back_pain`, `joint_pain`, `muscle_aches` after landing events | `CMB-BACK-01` | `back_pain` sev >= 2 for 3+ days | **yellow/red**, posture/exercise adjustments, report |
| `CMB-HYPOX-01` | SpO2 < 95 AND (`shortness_of_breath` OR `headache` OR `dizziness` OR `difficulty_concentrating` OR `fatigue` sev >= 2) | **red** (critical if SpO2 < 88): "possible low oxygen", sit down, check cabin/suit O2 and CO2 readings per mission procedure, alert crew, contact surgeon |
| `CMB-DCS-01` | `eva_today` (today or within the last 24 h) AND (`joint_pain` OR `tingling_numbness` OR `muscle_aches` sev >= 2 OR `shortness_of_breath` OR `dizziness`) | **red** (critical with `shortness_of_breath` or tingling/numbness): "possible decompression sickness after spacewalk", stop activity, alert crew, contact surgeon now |
| `CMB-IMM-01` | `rash_skin_irritation` (any severity) without fever | **yellow**: "skin/immune change (stress can reactivate dormant viruses)", log it, keep area clean, report if spreading or lasting 2 days; with fever, `CMB-INF-01` applies instead |
| 16 | Radiation-induced cancers | Space radiation | `radiation_msv` (daily and cumulative, if a dosimeter reading is available) | radiation bands, `TRD-RAD-01` | whole body (shown on `region_immune`) | Tracked (exposure only; cancer cannot be assessed by this app) |
| 17 | Inadequate systems operations support | Distance from Earth | none | none | none | **Out of scope:** operational/training risk, not a health indicator (mention in Learn only) |

**Content rules for Learn pages and tooltips**
- Write explanations in your **own words** (paraphrase); do not copy NASA text. Every Learn page and hazard/risk card ends with a **Sources** list linking the exact NASA/CSA pages used (Appendix E).
- Each risk card states: what the risk is, which hazard causes it, which inputs in the app relate to it, what the crew can do (exercise, sleep, nutrition, hydration, teamwork, reporting), and when to contact the flight surgeon.
- Put this table's data in `content/risks.ts` (typed) so the Learn pages, body-map panels and the rule engine's `explanation` lines all use the same risk ids and names.

---

## 3. Health Indicators (what is measured, why, how, risks)

All thresholds below are **starting defaults** based on general adult clinical references. They MUST be stored in `config/thresholds.ts` (and mirrored server-side in `thresholds.json`) and must be reviewed and adjustable by a flight surgeon. Do not treat them as validated space-medicine limits.

### 3.1 Measurable-in-space indicators

| # | Indicator | Unit | How it is measured in space | Why it matters in spaceflight | Input type |
|---|---|---|---|---|---|
| 1 | Resting heart rate | bpm | Wrist/chest sensor or manual pulse count for 30 s x 2 | Cardiovascular deconditioning, stress, dehydration, arrhythmia | number |
| 2 | Blood pressure | mmHg (sys/dia) | Automatic cuff | Fluid shift in micro-g, cardiovascular risk | two numbers |
| 3 | Fasting blood glucose | mg/dL | Finger-prick glucometer | Insulin resistance and nutrition changes in space | number |
| 4 | Body temperature | °C | Ear/forehead/oral thermometer | Infection, immune changes; heat management in closed habitat | number |
| 5 | Blood oxygen (SpO2) | % | Pulse oximeter | Cabin air quality, CO2, altitude-like habitat pressure | number |
| 6 | Sleep duration | hours | Manual entry or wearable | Isolation, circadian disruption; strongly linked to mood and performance | number |
| 7 | Sleep quality | 1 to 5 | Self-rating | Same as above | slider |
| 8 | Mood | 1 to 5 (emoji scale) | Self-rating | Behavioural health, isolation | emoji tap |
| 9 | Stress / fatigue | 1 to 5 | Self-rating | Workload, radiation, sleep | slider |
| 10 | Body weight | kg | Mass measurement device (not a scale in micro-g) | Nutrition, muscle loss | number |
| 11 | Exercise minutes (resistance / cardio) | min | Logged | Bone and muscle protection (about 2 h/day is typical on ISS) | two numbers |
| 12 | Hydration / water intake | mL | Logged | Dehydration risk, fluid shift | number |
| 13 | Calories / nutrition self-check | kcal or 1 to 5 | Logged or self-rating | Inadequate nutrition risk | number or slider |
| 14 | Radiation dose (if dosimeter available) | mSv (daily and cumulative) | Personal dosimeter reading | Radiation exposure budget | number |
| 15 | Symptoms checklist | enum list | Self-report | Early warning of many conditions | multi-select |
| 16 | Team relations | 1 to 5 | Self-rating | Inadequate-teamwork risk in isolation (optional) | slider |
| 17 | Spacewalk (EVA) today | yes/no | Self-report | Context for decompression-sickness and EVA-injury rules (only for missions with EVAs) | toggle |

**MVP minimum:** #1, 2, 3, 4, 5, 6, 8, 15 plus exercise minutes. Everything else is "Phase 2".

> **Input method for every row above: manual form entry** (number field, stepper, slider, emoji tap or checklist). The "How it is measured in space" column is only used to teach the astronaut how to take the measurement with their own equipment.

### 3.2 Default thresholds (config)

Status values: `green` (normal), `yellow` (watch/act), `red` (contact flight surgeon), `critical` (urgent: stop activity, call now).

| Indicator | Green | Yellow | Red | Critical |
|---|---|---|---|---|
| Heart rate (rest) | 50 to 100 | 40 to 49 or 101 to 110 | <40 or 111 to 130 | >130 at rest or with chest pain/syncope |
| BP systolic | 90 to 129 | 130 to 139 or 85 to 89 | 140 to 179 or <85 | >=180 |
| BP diastolic | 60 to 84 | 85 to 89 | 90 to 119 or <55 | >=120 |
| Glucose (fasting) | 70 to 99 | 100 to 125 | 126 to 250 or 54 to 69 | >250 or <54 |
| Temperature | 36.1 to 37.2 | 37.3 to 37.9 or 35.8 to 36.0 | 38.0 to 39.4 or <35.8 | >=39.5 |
| SpO2 | 95 to 100 | 92 to 94 | 88 to 91 | <88 |
| Sleep (hours) | 7 to 9 | 5 to <7 or >9 to 10 | <5 | (none) |
| Mood (1 to 5) | 4 to 5 | 3 | 2 | 1 (plus ideation/safety flag, see 4.4) |
| Exercise (min/day) | >=60 | 30 to 59 | <30 for 3+ days | (none) |
| Hydration (mL/day) | >=2000 | 1500 to 1999 | <1500 | (none) |
| Radiation dose | within mission budget | >80% of daily/mission budget | >100% | (none) |
| Team relations (1 to 5) | 4 to 5 | 3 | 1 to 2 for 3+ days | (none) |

Evaluation of a **two-part metric** (BP) uses the worse of the two parts.

### 3.3 Config file shape (TypeScript)

```ts
// config/thresholds.ts
export type Status = "green" | "yellow" | "red" | "critical";

export interface Band { status: Status; min?: number; max?: number } // inclusive bounds

export interface IndicatorConfig {
  id: string;                 // "heart_rate"
  label: string;
  unit: string;
  bands: Band[];              // evaluated top to bottom, first match wins; order critical -> green
  hazards: Hazard[];          // links to Section 2
  whyItMatters: string;
  howToMeasure: string[];     // simple steps for beginners
  tips: Record<Status, string[]>; // advice per status
  source: string;             // where the default range comes from (clinical reference / NASA page)
  verified: boolean;          // false until a human has checked it; show "unverified default" in settings
}
```

---

## 4. Rule Engine (the "guidance brain")

Pure, deterministic, unit-tested. Same logic in TypeScript (offline in browser) and Python (server, for ground view and verification). Shared test vectors live in `/shared/rule-test-vectors.json` and BOTH implementations must pass them.

### 4.1 Pipeline

```text
Inputs: today's DailyLog + symptoms + last N days + mission context (environment, mission day)
  1. Per-indicator banding      -> status per indicator
  2. Symptom rules              -> flags (e.g. "possible CO2 exposure")
  3. Combination rules          -> escalated statuses (multi-signal)
  4. Trend rules (3/5/7 days)   -> trend alerts
  5. Mission-phase/environment modifiers
  6. Overall status = worst status across all of the above
  7. Guidance builder           -> ordered actions (max 4 shown) + escalation block
Output: EvaluationResult { overall, indicators[], flags[], trends[], actions[], escalation }
```

### 4.2 Output type

```ts
interface EvaluationResult {
  overall: Status;
  indicators: { id: string; value: number | string; status: Status; ruleId: string; message: string }[];
  flags: { id: string; status: Status; message: string; hazard: Hazard }[];
  trends: { id: string; status: Status; message: string; windowDays: number }[];
  actions: { id: string; priority: 1 | 2 | 3 | 4; text: string; category: "rest"|"exercise"|"nutrition"|"hydration"|"mental"|"measure"|"medical"|"environment" }[];
  escalation: { level: "none" | "self_care" | "contact_surgeon" | "emergency"; text: string } | null;
  explanation: string[];      // human-readable "why" lines (rule ids + values)
}
```

### 4.3 Symptom list (multi-select)

`headache`, `dizziness`, `nausea_vomiting`, `fatigue`, `muscle_aches`, `back_pain`, `joint_pain`, `chest_pain`, `shortness_of_breath`, `palpitations`, `fever_chills`, `cough_sore_throat`, `rash_skin_irritation`, `vision_changes`, `eye_pain`, `facial_puffiness`, `loss_of_appetite`, `abdominal_pain`, `insomnia`, `low_mood`, `anxiety`, `irritability`, `difficulty_concentrating`, `ear_congestion`, `tingling_numbness`.

Each symptom has severity: 1 (mild), 2 (moderate), 3 (severe).

### 4.4 Rule catalogue (starter set; implement all, make easy to extend)

**Per-indicator:** `HR-01..`, `BP-01..`, `GLU-01..`, `TEMP-01..`, `SPO2-01..`, `SLP-01..`, `MOOD-01..`, `EXR-01..`, `HYD-01..`, `RAD-01..` generated from the band table.

**Symptom / combination rules (examples; implement these):**

| Rule id | Condition | Result |
|---|---|---|
| `CMB-CHEST-01` | `chest_pain` (sev >= 2) OR (`chest_pain` AND `shortness_of_breath`) | **critical**, emergency escalation, stop activity, sit/secure, contact surgeon now |
| `CMB-CO2-01` | `headache` + (`dizziness` OR `shortness_of_breath` OR `difficulty_concentrating`) + (SpO2 yellow/red OR >=2 crew report same) | **red**, flag "possible high CO2 / air quality problem", action: check cabin CO2 monitor, move to a different module, alert crew |
| `CMB-INF-01` | temp >= 37.8 AND (`cough_sore_throat` OR `fever_chills` OR `rash_skin_irritation`) | **red**, "possible infection", isolate, hydrate, contact surgeon |
| `CMB-CV-01` | HR red AND (`dizziness` OR `palpitations`) | **red**, sit/rest, repeat measurement after 10 min, contact surgeon |
| `CMB-HYP-01` | BP red AND (`headache` OR `vision_changes`) | **critical/red**, contact surgeon (possible severe hypertension or intracranial/vision issue) |
| `CMB-VIS-01` | `vision_changes` or `eye_pain` (any severity) | **yellow -> red if persists 2 days**, log, do vision self-test, report (spaceflight-associated neuro-ocular syndrome watch) |
| `CMB-DEHY-01` | hydration yellow/red AND (`dizziness` OR `fatigue` OR HR elevated) | **yellow/red**, drink water/electrolytes, reassess in 2 h |
| `CMB-GLU-01` | glucose red AND (`nausea_vomiting` OR `abdominal_pain` OR excessive thirst) | **red/critical**, contact surgeon |
| `CMB-HYPO-01` | glucose < 70 AND (`dizziness` OR `fatigue` OR shaking/sweating) | **red**, fast-acting carbohydrate, recheck in 15 min |
| `CMB-SAM-01` | `nausea_vomiting` + `dizziness` in first 3 mission days or first 3 days after gravity change | **yellow**, "space adaptation syndrome", slow head movements, hydration, rest |
| `CMB-MENT-01` | mood <= 2 AND (`low_mood` OR `anxiety` OR `insomnia`) | **red**, behavioural-health protocol: talk to a crewmate, schedule private call/counsellor |
| `CMB-SAFETY-01` | user selects "thoughts of harming myself" (separate explicit item in mood step) | **critical**, show immediate human-support instructions and contact surgeon now; never hide this behind a settings option |
| `CMB-BACK-01` | `back_pain` sev >= 2 for 3+ days | **yellow/red**, posture/exercise adjustments, report |

**Trend rules (computed on stored logs):**

| Rule id | Condition | Result |
|---|---|---|
| `TRD-SLP-01` | sleep < 6 h for 3 of last 3 days | yellow: "sleep debt building" |
| `TRD-SLP-02` | sleep < 6 h for 5 of last 7 days | red: "chronic sleep loss, behavioural risk" |
| `TRD-MOOD-01` | mood strictly decreasing for 4 days OR average of last 5 days <= 2.5 | yellow/red |
| `TRD-BP-01` | systolic average of last 5 days >= 135 | yellow, suggest sodium/exercise/measure schedule |
| `TRD-HR-01` | resting HR +15 bpm above personal 14-day baseline for 3 days | yellow |
| `TRD-EXR-01` | exercise < 30 min on 3 consecutive days | yellow: "bone and muscle protection at risk" |
| `TRD-WGT-01` | weight loss > 3% in 14 days | yellow/red: nutrition check |
| `TRD-RAD-01` | cumulative radiation projects to exceed mission budget | yellow/red |
| `TRD-MISS-01` | no log for 2 days | yellow reminder; no log for 4 days -> alert on surgeon view |
| `TRD-TEAM-01` | `team_relations` <= 2 for 3 consecutive days (or 5-day average <= 2.5) | yellow: "team tension building", talk to a crewmate/commander, use the crew conflict protocol, mention to the surgeon/psychologist |

**Mission-phase modifiers (config):**
- Mission day 1 to 7: expect space-adaptation symptoms; soften yellow for `nausea`, `dizziness`, `facial_puffiness`, `ear_congestion`, but never soften red/critical.
- Long-isolation window (e.g. after 30%, 50%, 70% of mission): increase weight of mood/sleep trends ("third-quarter effect").
- Environment modifiers: `rover` (high vibration, tight cabin: motion sickness, back pain), `moon_base` / `mars_base` (partial gravity: bone-loading exercises still required; dust exposure: cough/eye irritation), `station` / `spacecraft` (micro-g: fluid shift, vision, bone loss).

### 4.5 Guidance content rules
- Every action is short (max 140 characters), specific, and doable now.
- Every non-green indicator shows: **what it means**, **what to do now**, **when to escalate**.
- Always include a **"re-measure"** action when a value is borderline (re-check after 10 to 15 min rest).
- Escalation text templates: `self_care`, `contact_surgeon` (include what data to share: last 3 values + symptoms), `emergency` (stop activity, secure yourself, alert crew, call).
- Never give drug doses or prescriptions. Link to "Onboard medical kit (check your mission formulary)" as generic text only.

---

## 5. Architecture (Offline-First)

```text
┌───────────────────────── Device (tablet/laptop in habitat) ─────────────────────────┐
│ Next.js PWA (Tailwind)                                                              │
│   UI ──► Zustand store ──► Dexie (IndexedDB)  ◄── Rule engine (TS)                  │
│                                │                                                    │
│                                ├── outbox (pending changes)                         │
│                                └── Sync worker (service worker / background loop)   │
│ Service Worker: caches app shell, assets, fonts; schedules local notifications       │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
                                    │ opportunistic, when a link exists
                          ┌─────────▼──────────┐
                          │ FastAPI (local LAN  │   same code runs:
                          │ OR ground/cloud)    │   - on a habitat computer (SQLite)
                          └─────────┬──────────┘   - in cloud (Neon Postgres)
                                    │
                        SQLite (local) / Neon PostgreSQL (ground)
```

### 5.1 Key decisions (and why)

1. **IndexedDB is the primary database for the UI.** The user never waits for a server. This satisfies "offline-first" fully.
2. **Neon is cloud-hosted, so it cannot be required for daily use.** It is the *sync / ground-control* store. In the mission, replace it with a local FastAPI + SQLite on a habitat computer, and sync to Neon whenever Earth link is available. The same SQLAlchemy models work for both via `DATABASE_URL`.
3. **Sync is append-mostly with client-generated UUIDs.** Daily logs are rarely edited, so conflicts are rare; resolve with "last-write-wins by `updated_at`, with `version` counter" and never silently delete.
4. **Rule engine runs on the client** (offline) and is **re-run on the server** only for verification/ground dashboards.
5. **Reminders are scheduled on the client** (works offline). The server cron/scheduler is optional (for ground-originated reminders when synced).
6. **Everything has a "last synced" indicator** and a visible offline/online badge. Offline is a normal state, not an error.
7. **Multi-astronaut on one device:** several astronaut profiles can live in the same IndexedDB (shared habitat tablet). The active astronaut is selected on the Crew screen and unlocked with a PIN (PIN is a convenience lock, not strong security). Every query is scoped by `astronautId`.
8. **Multi-astronaut across devices:** crew registry and all data are shared between devices only through the backend (`HABITAT_LAN` or `GROUND_SYNC`). Without a backend, each device only knows the astronauts registered on it.
9. **Roles:** `astronaut` (own data only), `commander` and `surgeon` (read-only access to all crew), `admin` (register/deactivate astronauts).

### 5.2 Deployment modes (support all three via env)

| Mode | Where backend runs | DB | Use |
|---|---|---|---|
| `LOCAL_ONLY` | none (frontend only) | IndexedDB | Absolute minimum, demo without any server |
| `HABITAT_LAN` | FastAPI on a local machine | SQLite | Multi-device in habitat, no internet |
| `GROUND_SYNC` | FastAPI on cloud | Neon Postgres | Flight surgeon dashboard, history backup |

---

## 6. Data Model

### 6.1 IndexedDB (Dexie) schema

```ts
// db/schema.ts
export class AHMDB extends Dexie {
  astronauts!: Table<Astronaut, string>;   // name, crewCode (unique), role, environment, mission dates, pinHash
  logs!: Table<DailyLog, string>;         // one per profile per local date
  symptoms!: Table<SymptomEntry, string>;
  evaluations!: Table<StoredEvaluation, string>;
  followups!: Table<AdviceFollowup, string>;
  reminders!: Table<Reminder, string>;
  gamification!: Table<GameState, string>;
  settings!: Table<Setting, string>;
  outbox!: Table<OutboxItem, number>;     // pending sync ops
  syncMeta!: Table<SyncMeta, string>;     // lastPulledAt per entity, deviceId

  constructor() {
    super("ahm");
    this.version(1).stores({
      astronauts: "id, &crewCode, name, role",
      logs: "id, astronautId, date, [astronautId+date], updatedAt",
      symptoms: "id, logId, astronautId, date, symptom",
      evaluations: "id, logId, astronautId, date",
      followups: "id, astronautId, date, actionId",
      reminders: "id, astronautId, time, enabled",
      gamification: "astronautId",
      settings: "key",
      outbox: "++seq, entity, entityId, createdAt",
      syncMeta: "key",
    });
  }
}
```

### 6.2 PostgreSQL / SQLite schema (SQLAlchemy; shown as SQL)

```sql
CREATE TABLE astronauts (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  crew_code TEXT UNIQUE NOT NULL,         -- unique astronaut ID shown in UI, e.g. "AST-001"
  role TEXT NOT NULL DEFAULT 'astronaut' CHECK (role IN ('astronaut','commander','surgeon','admin')),
  pin_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  environment TEXT NOT NULL CHECK (environment IN ('spacecraft','station','rover','moon_base','mars_base')),
  mission_start DATE,
  mission_end DATE,
  birth_year INT,                         -- optional, for age-adjusted ranges
  sex_at_birth TEXT,                      -- optional, for ranges
  height_cm NUMERIC, baseline_weight_kg NUMERIC,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE daily_logs (
  id UUID PRIMARY KEY,                    -- generated on client
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  log_date DATE NOT NULL,                 -- mission-local date
  mission_day INT,
  heart_rate INT, bp_systolic INT, bp_diastolic INT,
  glucose_mgdl NUMERIC, temperature_c NUMERIC, spo2 INT,
  sleep_hours NUMERIC, sleep_quality INT,
  mood INT, stress INT, team_relations INT, weight_kg NUMERIC,
  eva_today BOOLEAN NOT NULL DEFAULT FALSE,
  exercise_resistance_min INT, exercise_cardio_min INT,
  water_ml INT, calories INT, radiation_msv NUMERIC,
  notes TEXT,
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,   -- late entry, still user-entered
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  UNIQUE (astronaut_id, log_date)
);

CREATE TABLE symptom_entries (
  id UUID PRIMARY KEY,
  log_id UUID NOT NULL REFERENCES daily_logs(id),
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  symptom TEXT NOT NULL,
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE evaluations (
  id UUID PRIMARY KEY,
  log_id UUID NOT NULL REFERENCES daily_logs(id),
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  overall_status TEXT NOT NULL,
  result_json JSONB NOT NULL,             -- full EvaluationResult
  rules_version TEXT NOT NULL,            -- so old results remain explainable
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE advice_followups (
  id UUID PRIMARY KEY,
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  evaluation_id UUID REFERENCES evaluations(id),
  action_id TEXT NOT NULL,
  followed BOOLEAN,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1
);

CREATE TABLE reminders (
  id UUID PRIMARY KEY,
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  kind TEXT NOT NULL,                     -- 'daily_checkin','measure_bp','exercise','sleep','custom'
  local_time TIME NOT NULL,               -- e.g. 08:00
  days_of_week INT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  message TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1
);

CREATE TABLE game_state (
  astronaut_id UUID PRIMARY KEY REFERENCES astronauts(id),
  points INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  badges JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL, version INT NOT NULL DEFAULT 1
);

CREATE TABLE sync_devices (
  id UUID PRIMARY KEY, label TEXT, last_seen_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, actor TEXT, action TEXT, entity TEXT, entity_id UUID, at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON daily_logs (astronaut_id, log_date DESC);
CREATE INDEX ON symptom_entries (astronaut_id, created_at DESC);
CREATE INDEX ON daily_logs (updated_at);   -- for sync pull
```

SQLite compatibility notes: use `JSON` instead of `JSONB`, `TEXT` for UUIDs, store arrays as JSON. Use SQLAlchemy generic types (`Uuid`, `JSON`) so one model set works for both.

---

## 7. Backend: FastAPI

### 7.1 Folder structure

```text
backend/
├─ app/
│  ├─ main.py                  # FastAPI app, CORS, lifespan
│  ├─ core/config.py           # Settings (pydantic-settings): DATABASE_URL, MODE, SECRET_KEY
│  ├─ core/security.py         # JWT, password/PIN hashing
│  ├─ db/session.py            # async engine/session (asyncpg for Neon, aiosqlite for local)
│  ├─ db/models.py             # SQLAlchemy models
│  ├─ schemas/                 # Pydantic v2 models (in/out)
│  ├─ routers/
│  │   ├─ auth.py
│  │   ├─ astronauts.py
│  │   ├─ logs.py
│  │   ├─ evaluate.py
│  │   ├─ reminders.py
│  │   ├─ gamification.py
│  │   ├─ sync.py              # push/pull
│  │   └─ ground.py            # flight-surgeon read-only views
│  ├─ services/
│  │   ├─ rule_engine/         # python port of rule engine
│  │   │   ├─ thresholds.json
│  │   │   ├─ bands.py  symptoms.py  combos.py  trends.py  guidance.py  engine.py
│  │   ├─ sync_service.py
│  │   └─ gamification_service.py
│  └─ tests/
├─ alembic/ ...
├─ requirements.txt
└─ .env.example
```

### 7.2 Environment variables

```env
MODE=GROUND_SYNC                 # or HABITAT_LAN
DATABASE_URL=postgresql+asyncpg://USER:PASS@HOST/db?sslmode=require   # Neon
# Local/offline: DATABASE_URL=sqlite+aiosqlite:///./ahm.db
SECRET_KEY=change-me
ACCESS_TOKEN_MINUTES=720
CORS_ORIGINS=http://localhost:3000,http://192.168.1.10:3000
```

> Neon tip: use the pooled connection string for the API, and note Neon may need a short cold-start; the client must never depend on this (offline-first).

### 7.3 API contract (all JSON, prefix `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Body `{crew_code, pin}` -> JWT with role (works on LAN, no internet) |
| GET | `/astronauts` | List crew: name, crew_code, role, last check-in date, latest overall status (astronaut role sees only self; commander/surgeon see all) |
| POST | `/astronauts` | Register an astronaut: full name, unique crew_code, role, environment, mission dates, PIN (admin or first-run setup) |
| GET | `/astronauts/{id}` | One astronaut profile |
| PUT | `/astronauts/{id}` | Update profile/environment/mission dates |
| GET | `/astronauts/me` | Current logged-in astronaut |
| POST | `/logs` | Create/upsert a daily log (idempotent on `id`) |
| GET | `/logs?from=&to=` | History for charts |
| GET | `/logs/today` | Today's log |
| POST | `/symptoms` | Bulk upsert symptom entries for a log |
| POST | `/evaluate` | Evaluate a payload with rule engine (stateless) |
| GET | `/evaluations/latest` | Latest stored evaluation |
| GET | `/reminders` / POST / PUT / DELETE | Reminder CRUD |
| POST | `/followups` | Record "did you follow the advice" |
| GET | `/gamification` | Points/streak/badges |
| POST | `/sync/push` | Client pushes outbox batch |
| GET | `/sync/pull?since=ISO` | Client pulls changes since timestamp |
| GET | `/ground/crew` | (surgeon role) list crew + latest overall status |
| GET | `/ground/crew/{id}/summary` | (surgeon role) last 30 days summary + alerts |
| GET | `/health` | Liveness (used for online detection) |

**Access rules.** Every data endpoint (`/logs`, `/symptoms`, `/evaluations`, `/reminders`, `/followups`, `/gamification`) is scoped by astronaut: astronaut tokens may only read/write their own `astronaut_id`; commander/surgeon tokens may read any astronaut but write nothing except surgeon notes. Responses always include `astronaut_id`, `name` and `crew_code` so the UI can label the data.

### 7.4 Sync protocol (the heart of offline-first)

**Client side**
1. Every create/update/delete writes to its Dexie table **and** an `outbox` row `{entity, entityId, op, payload, createdAt}` in one transaction.
2. When `navigator.onLine` is true **and** `GET /health` succeeds, the sync worker runs: push outbox in order (batches of 50), then pull.
3. On push success, delete outbox rows. On failure, keep them and retry with exponential backoff (max 5 min).
4. Pull applies server changes into Dexie (skip if local `version` is newer; if equal timestamps prefer server).

**Server side**
```jsonc
// POST /sync/push
{ "deviceId": "uuid", "items": [
  { "entity": "daily_log", "id": "uuid", "op": "upsert", "version": 3, "updatedAt": "...", "data": { } },
  { "entity": "symptom_entry", "id": "uuid", "op": "delete", "version": 2, "updatedAt": "..." }
]}
// response
{ "accepted": ["id1","id2"], "conflicts": [{ "id": "id3", "serverVersion": 5, "serverData": { } }] }

// GET /sync/pull?since=2026-11-10T00:00:00Z
{ "serverTime": "...", "changes": { "daily_log": [ ], "symptom_entry": [ ], "reminder": [ ] } }
```
Rules: idempotent upserts by UUID; soft delete via `deleted_at`; conflict = server `version` > client base version -> return conflict, client keeps both and keeps the newer `updatedAt`; never lose a health record.

---

## 8. Frontend: Next.js + Tailwind

### 8.1 Tech choices
- Next.js App Router + TypeScript, **static export or standalone** (must run without a Node server if possible; prefer `output: "export"` for fully offline PWA, or serve the build from FastAPI static files in `HABITAT_LAN`).
- **PWA**: `serwist` (or `@ducanh2912/next-pwa`) for service worker, precache app shell, runtime cache for fonts/icons. Manifest with standalone display, icons, theme colour.
- State: Zustand. Local DB: Dexie + `dexie-react-hooks` (`useLiveQuery`).
- Forms: React Hook Form + Zod (validation ranges prevent typos like HR 780).
- Charts: Recharts (or visx). Animations: Framer Motion.
- 3D: `three`, `@react-three/fiber`, `@react-three/drei` (OrbitControls, useGLTF, Html). Load the canvas with `dynamic(() => import("./Body3D"), { ssr: false })`. **Do not use `<Environment preset=...>` or drei `<Text>` default fonts** (they fetch from a CDN and break offline); use local lights and `Html` labels or a bundled font.
- Icons: lucide-react. No external CDNs at runtime (offline): bundle fonts locally via `next/font/local`.
- Date handling: `date-fns` with a single `getMissionDate()` helper (mission-local day).

### 8.2 Folder structure

```text
frontend/
├─ app/
│  ├─ layout.tsx   manifest.ts   sw.ts
│  ├─ (app)/
│  │   ├─ page.tsx                    # Home / today dashboard (active astronaut)
│  │   ├─ crew/page.tsx               # Register astronaut, pick astronaut, crew overview
│  │   ├─ checkin/page.tsx            # Daily check-in wizard
│  │   ├─ body/page.tsx               # Interactive 3D body
│  │   ├─ trends/page.tsx             # Charts
│  │   ├─ learn/[indicator]/page.tsx  # Explanations, how to measure
│  │   ├─ reminders/page.tsx
│  │   ├─ rewards/page.tsx            # Gamification
│  │   ├─ environment/page.tsx        # Mission/environment settings
│  │   ├─ sync/page.tsx               # Sync status, manual sync, export
│  │   └─ settings/page.tsx
│  └─ ground/page.tsx                 # Flight surgeon view (optional, needs sync)
├─ components/
│  ├─ status/ StatusBadge.tsx  StatusRing.tsx  IndicatorCard.tsx
│  ├─ body3d/ Body3D.tsx  BodyModel.tsx  RegionHotspot.tsx  CameraRig.tsx  BodyPartPanel.tsx  RegionList.tsx  Body2DFallback.tsx
│  ├─ crew/ CrewPicker.tsx  CrewCard.tsx  RegisterAstronaut.tsx  PinPad.tsx  CrewOverview.tsx  ActiveAstronautBar.tsx
│  ├─ checkin/ Stepper.tsx  SymptomPicker.tsx  MeasureStep.tsx  MoodPicker.tsx
│  ├─ charts/ TrendChart.tsx  SleepBars.tsx  BpBand.tsx  Sparkline.tsx
│  ├─ guidance/ ActionList.tsx  EscalationCard.tsx
│  ├─ game/ StreakFlame.tsx  BadgeGrid.tsx  PointsBar.tsx
│  ├─ common/ OfflineBadge.tsx  Disclaimer.tsx  EmptyState.tsx
├─ lib/
│  ├─ rules/ (engine.ts, bands.ts, combos.ts, trends.ts, guidance.ts)   # shared logic
│  ├─ db/ (schema.ts, repo.ts)
│  ├─ sync/ (outbox.ts, worker.ts, api.ts)
│  ├─ notifications/ (scheduler.ts, permissions.ts)
│  ├─ gamification/ (points.ts, badges.ts)
│  └─ time/ missionDate.ts
├─ config/ thresholds.ts  hazards.ts  bodyParts.ts  symptoms.ts  badges.ts
├─ content/ learn/*.md
└─ tests/
```

### 8.3 Screens (what each must do)

**0. Crew (first screen of the app)**
- **First launch (no astronauts exist):** empty state "No astronauts registered yet" with a **Register astronaut** form: full name, unique crew ID (e.g. `AST-001`, uniqueness validated), role, environment, mission start/end dates, 4 to 6 digit PIN. Nothing is pre-filled or pre-created.
- **Crew picker:** one card per registered astronaut showing **name, crew ID, role, last check-in date and latest overall status** (from that astronaut's real latest evaluation; "No check-in yet" if none). Tap a card -> PIN pad -> that astronaut becomes the *active astronaut*.
- **Active astronaut bar** is visible on every screen: `Name · ID · Mission day N · [Switch astronaut]`. Auto-lock after inactivity (configurable).
- **Commander/surgeon "Crew overview":** table/grid of ALL astronauts with name, ID, last check-in, overall status, active flags and a 7-day sparkline per key indicator; search by name or ID, sort by status (worst first). Opening an astronaut shows their full dashboard in **read-only** mode.
- An astronaut can never see another astronaut's data unless their role is commander/surgeon.

**1. Home / Today dashboard**
- Large **overall status ring** (animated, colour + icon + label).
- Mission day, environment, "last synced" and offline badge.
- 6 to 8 **indicator cards** (value, unit, colour, tiny sparkline, tap -> detail).
- **Today's actions** (max 4) with checkboxes (feeds gamification and follow-up).
- Primary button: "Start daily check-in" (changes to "Update today" after completion).
- Escalation card pinned at top if red/critical.

**2. Daily check-in wizard (mobile-first, one question per screen, big targets)**
1. **Yesterday recap**: summary of last log + last advice list with "Did you do this? Yes / Partly / No".
2. **Symptoms**: grid of symptom chips with icon; tap to select; tap again to set severity 1 to 3. "None today" big button.
3. **Measurements**: each measurement is a card with "?" -> bottom sheet with simple steps ("How to measure"), unit, valid range guard, "Skip" allowed (but skipped essentials reduce completeness score).
4. **Mood and stress**: emoji picker 1 to 5; safety question phrased carefully with an immediate support path (rule `CMB-SAFETY-01`). Also the optional **team relations** slider (1 to 5) and, for missions with spacewalks, a **"Spacewalk (EVA) today?"** toggle.
5. **Review**: show entered values; edit buttons.
6. **Result**: animated reveal of status + actions + escalation; save to Dexie, enqueue outbox, award points.

**3. Interactive 3D body (required by the challenge)**

*What the user sees:* a full 3D human body, slowly idle-rotating, belonging to the **active astronaut** (header shows name + ID). Each region glows in the colour of that astronaut's latest real evaluation (green / yellow / red / critical; red and critical pulse). The astronaut can rotate (drag), zoom (pinch/scroll), tap a region, and the camera smoothly flies to it while a panel opens.

*Tech:* React Three Fiber + drei, loaded client-side only (`ssr: false`).

*Model sourcing (fully offline):*
1. Preferred: a low-poly (< 60k triangles) human `.glb` stored at `public/models/body.glb`, with **separately named meshes per region** (`region_head`, `region_brain`, `region_eyes`, `region_heart`, `region_lungs`, `region_gut`, `region_muscles`, `region_spine`, `region_skin`, `region_immune`, `region_mind`). Use a model whose licence allows reuse (CC0 or CC-BY) and credit it in the README.
2. If the model is not segmented into regions: keep the body as one mesh and add **invisible hotspot meshes** (spheres/capsules) at positions defined in `config/bodyParts.ts`; hotspots are the clickable/coloured elements (translucent glowing markers over the body).
3. Fallback if no model is available yet: build a stylised body procedurally from three.js primitives (capsules/spheres) so the feature is never blocked. Replace with the GLB later without changing the rest of the code.

*Behaviour:*
- Raycast click/tap selects a region (`onPointerOver` highlight, tooltip with region name); selection state lives in the Zustand store.
- `CameraRig` animates the camera to the region (lerp), with a "Reset view" button.
- Material emissive colour + pulse animation by status; respect `prefers-reduced-motion` (no pulse, static glow).
- Optional layer toggle: Skin / Muscles / Skeleton / Organs (only if the model supports it).
- **Accessible alternative:** a `RegionList` (buttons for every region with its status text) beside/under the canvas, so keyboard and screen-reader users and low-end devices get the same information.
- Performance: `dpr={[1, 2]}`, `frameloop="demand"` when idle and nothing animating, dispose geometries on unmount, target 30+ fps on a mid-range tablet.
- If WebGL is unavailable or the canvas crashes: render `Body2DFallback` (simple SVG with the same regions and colours).
- Empty state: with no evaluation yet, all regions are neutral grey and the panel says "No data yet. Complete a check-in to see this region's status."

*Region panel (`BodyPartPanel`) shows for the selected region:*
1. **Function** of the body part (one short paragraph).
2. **How spaceflight affects it** (linked hazard badges from Section 2).
3. **Related indicators with this astronaut's latest real values** and their status (or "No data yet").
4. **Related symptoms** reported recently.
5. **What to do now** (guidance actions tagged to this region) and escalation if red.
6. Link to the **Learn** page for the related indicators.

*Region mapping (`config/bodyParts.ts`):*

| Region id | Indicators / symptoms feeding it | Main hazard link |
|---|---|---|
| `region_brain` (Head/Brain) | headache, dizziness, difficulty_concentrating, CO2 combo | Closed environment (CO2), micro-g fluid shift |
| `region_eyes` | vision_changes, eye_pain | Micro-g (SANS), radiation |
| `region_heart` | HR, BP, chest_pain, palpitations | Micro-g deconditioning, radiation |
| `region_lungs` | SpO2, shortness_of_breath, cough | Closed environment, dust (surface missions) |
| `region_gut` | nausea, abdominal_pain, appetite, glucose, calories | Nutrition, space adaptation |
| `region_muscles` | exercise minutes, muscle_aches, weight | Altered gravity |
| `region_spine` (Bones/Spine) | exercise (resistance), back_pain | Altered gravity (bone loss) |
| `region_skin` | rash_skin_irritation | Closed environment, radiation |
| `region_immune` | temperature, fever, infection combo | Radiation, stress, closed environment |
| `region_mind` | mood, stress, sleep, low_mood, anxiety | Isolation and confinement |

```ts
// config/bodyParts.ts
export interface BodyPart {
  id: string;                         // "region_heart"
  label: string;
  meshName?: string;                  // name inside body.glb, if segmented
  hotspot?: { position: [number, number, number]; radius: number }; // used when not segmented
  indicators: string[];               // ids from thresholds.ts
  symptoms: string[];
  hazards: Hazard[];
  functionText: string;
  spaceEffectText: string;
}
```

**4. Trends**
- Time-range tabs: 7 / 14 / 30 days / mission.
- One chart per indicator with **coloured threshold bands** in the background, personal baseline line, and markers for symptom days.
- Combined view: sleep + mood overlay; BP with sys/dia bands; exercise stacked bars (resistance/cardio); cumulative radiation vs budget.
- Trend alerts list under the charts.

**5. Learn**
- For each indicator: What it is, why it matters in space (hazard badges), how to measure (numbered steps with an illustration placeholder), normal ranges, when to worry. Content from `/content/learn/*.md`. Also a **Risks** section listing every NASA HRP risk from Section 2.1 with a short paraphrased explanation, linked inputs and a source link, and a **Sources** footer on every Learn page (Appendix E).

**6. Reminders**: list, add, edit, enable/disable; default set created at onboarding.

**7. Rewards**: points, level, streak flame, badges (see Section 11).

**8. Environment**: choose Spacecraft / Station / Rover / Moon base / Mars base; shows environment-specific tips and risk emphasis (e.g. Moon base: dust, 1/6 g bone loading; Rover: vibration, back pain, motion sickness).

**9. Sync / Data**: status, last sync time, pending count, "Sync now", export JSON/CSV (works offline), import.

**10. Crew overview (commander/surgeon)**: all astronauts by name and crew ID with status tiles, last check-in, active flags, 30-day charts per astronaut, alerts and surgeon notes. Read-only for health data. Across devices it needs sync; on a single device it reads the local registry.

### 8.4 Visual design system
- Dark, low-glare theme as default (habitat lighting), optional high-contrast light theme.
- Status colours (Tailwind tokens): `green #22c55e`, `yellow #facc15`, `red #ef4444`, `critical #b91c1c` with a pulsing outline. Always add icon (check / alert-triangle / alert-octagon / siren) and a text label.
- Typography: large numerals for values, readable body (min 16px), generous spacing.
- Motion: ring fill animation, card entrance stagger, body-part pulse on alert. Respect `prefers-reduced-motion`.
- Layout: mobile/tablet first; bottom nav (Home, Check-in, Body, Trends, More).
- Language: simple, short sentences; units always shown; no medical jargon without a tooltip.

---

## 9. Reminders and Notifications (works offline)

**Client scheduler (primary)**
- Reminders stored in Dexie. A `scheduler.ts` computes the next fire time for each enabled reminder.
- While the app/PWA is open: use `setTimeout` chains plus a 30 s interval check against `Date.now()` (resilient to sleep).
- When allowed, use the **Notification API** through the service worker (`registration.showNotification`) so the notification appears even if the tab is in the background. Ask permission with a friendly pre-prompt screen at onboarding.
- Where supported, use Notification Triggers/Periodic Background Sync as progressive enhancement (not relied on).
- **Fallback:** an in-app banner and a badge on app open: "Daily check-in due" and "BP measurement due".
- Missed reminder logic: if the check-in is not done by `due + 2 h`, show a gentle in-app nudge on next open; after 2 missed days, trigger rule `TRD-MISS-01`.

**Default reminder set (created at onboarding, editable)**
| Time | Reminder |
|---|---|
| Wake time + 30 min | Daily check-in (symptoms + measurements) |
| Fixed | Fasting glucose (if enabled) |
| Mid-day | Hydration and exercise nudge |
| Evening | Log exercise + mood + sleep prep |
| Weekly | Weight/body mass, vision self-test |

**Server side (optional)**: APScheduler job in `GROUND_SYNC`/`HABITAT_LAN` mode can create ground-originated reminders (e.g. "Flight surgeon requests an extra BP reading"); they reach devices through `/sync/pull`.

---

## 10. Daily Flow (end-to-end)

```text
08:00 reminder fires (local)  ->  open app (works offline)
  -> Step 1: yesterday recap + advice follow-up (Yes/Partly/No saved to followups)
  -> Step 2: symptoms
  -> Step 3: measurements (with how-to help)
  -> Step 4: mood/stress
  -> Review -> Save:
        Dexie: logs, symptoms, followups   (single transaction)
        Rule engine (client) -> EvaluationResult -> Dexie evaluations
        Gamification update -> Dexie
        Outbox enqueue (log, symptoms, evaluation, followups, gamification)
  -> Result screen: status, actions, escalation
  -> If online/LAN reachable: sync worker pushes outbox in background
```

---

## 11. Gamification (supports consistency, not competition)

| Mechanic | Rule |
|---|---|
| Points | Daily check-in +20; each measurement +5 (max 40); action completed +10; follow-up answered +5; 7-day streak bonus +50 |
| Streak | Consecutive days with a completed check-in; one "freeze" token per 14 days |
| Levels | `level = floor(sqrt(points/50)) + 1` |
| Badges | "First Orbit" (first check-in), "Iron Sleeper" (7 nights >= 7 h), "Bone Guardian" (14 days >= 60 min exercise), "Hydration Hero" (7 days >= target), "Calm Mind" (7 days mood >= 4), "Full Spectrum" (all MVP indicators in one day), "Mission Marathon" (30-day streak) |
| Weekly challenge | e.g. "5 nights of 7+ hours": progress ring on Home |

Guardrails: never reward unsafe behaviour (no points for skipping sleep or extreme exercise); never show shame messages for red days; don't gamify symptom reporting (avoid incentives to hide symptoms), so symptom entry gives no extra points and "None today" gives full check-in points.

---

## 12. Environment-Specific Behaviour

| Environment | Gravity | Emphasis (config) |
|---|---|---|
| Spacecraft (transit) | Micro-g | Fluid shift, vision, bone/muscle loss, isolation, radiation shelter drills, space adaptation first week |
| Space station | Micro-g | Same as above, plus established exercise (resistance device + treadmill + bike), CO2 monitoring |
| Rover | Partial/none while moving | Vibration, back pain, motion sickness, confinement, thermal comfort, short-duration stress |
| Moon base | ~1/6 g | Dust (eye/cough), bone loading still needed, radiation, isolation |
| Mars base | ~3/8 g | Long isolation, radiation, adaptation after 6-month transit, nutrition, communication delay |

Each environment supplies: default reminders, extra symptom prompts, tip pack, and modifiers to rules (Section 4.4).

---

## 13. Security and Privacy
- Health data is sensitive: encrypt backend transport (TLS in cloud; on LAN use a local TLS cert or an isolated network) and encrypt at rest on Neon.
- Local: optional app PIN lock (hash with PBKDF2/WebCrypto); optional encryption of IndexedDB payloads with a key derived from the PIN (WebCrypto AES-GCM) as a later enhancement.
- Auth: PIN + JWT on the API; roles `astronaut`, `surgeon` (read-only + notes). Astronaut can only access own data.
- Minimal data: no real names required; use crew codes.
- Audit log for ground-view access.
- Validate all inputs with Pydantic and Zod; reject physiologically impossible values (e.g. HR 20 to 250, SpO2 50 to 100, temp 30 to 43).
- Consent text at onboarding explaining what is stored and who can see it.
- Include a clear disclaimer (Section 15).

---

## 14. Testing and Quality

- **Rule engine**: table-driven tests using `shared/rule-test-vectors.json` (input -> expected statuses/flags/actions) run in Vitest (TS) and Pytest (Python). Include boundary values (e.g. HR 100/101, SpO2 92/91).
- **Sync**: tests for idempotent push, conflict path, delete propagation, retry/backoff, clock skew.
- **Offline**: Playwright test that loads the app, goes offline (`context.setOffline(true)`), completes a check-in, reloads, and confirms data persists; then goes online and verifies the outbox drains.
- **Accessibility**: axe checks; verify colour is never the only signal; keyboard and screen-reader labels.
- **Performance**: first load < 2 s on mid-range tablet; chart render < 100 ms for 180 days.
- **Lighthouse PWA** score target: installable + offline-capable.

---

## 15. Disclaimer Text (show at onboarding and on result screens)

> This tool supports self-assessment and does not replace a flight surgeon or medical care. Ranges are configurable defaults. If you feel unwell or a result is red or critical, follow your mission medical procedures and contact the flight surgeon.

---

## 16. No-Fake-Data Policy and Empty States

**Policy**
1. The shipped app contains **no** hardcoded, seeded, mocked, random or generated health data and **no** pre-created astronauts. No `seed_demo` script, no demo mode, no "simulate reading" button.
2. All values come from the forms. Every chart point, status colour, body-region glow, streak and badge is derived from records the user saved.
3. Rule-engine **test fixtures** live only in `/shared/rule-test-vectors.json` and `tests/`. They are never imported by app code and are excluded from the production bundle.
4. Add a CI check (grep/ESLint rule) that fails the build if app code uses `Math.random()`, `faker`, or literal health-value arrays outside `tests/` and `config/` (thresholds are configuration, not patient data).
5. For presentations, enter real check-ins through the normal form (use the "late entry" date picker for earlier days) for each astronaut. Nothing is injected by code.

**Empty states (every screen must have one)**
| Screen | Empty state |
|---|---|
| Crew | "No astronauts registered yet" + Register button |
| Home | "No check-in yet for <Name · ID>" + Start check-in button; no status ring value, grey cards |
| Trends | "Charts appear after your first check-in." Per chart, if fewer days than a rule needs: "Need N more days of data for trend analysis." |
| Body 3D | Grey neutral regions + "No data yet" in the panel |
| Rewards | 0 points, 0 streak, locked badges |
| Crew overview | Astronaut rows show "No check-in yet" instead of a status |
| Sync | "Nothing to sync" |

**Minimum data for analysis**
- Per-indicator and combination rules work from the very first check-in.
- 3-day trend rules need 3 real logs; 5/7-day rules need 5/7; personal baselines need 14 logs. Until then the UI states exactly how many more days are needed.

---

## 17. Implementation Details to Get Right

1. **Mission date**, not calendar date: derive `log_date` from device local time and mission timezone setting (habitats often run UTC or a crew schedule). One `getMissionDate()` helper, used everywhere.
2. **Idempotency**: client creates UUIDs (`crypto.randomUUID()`); server upserts by id.
3. **Evaluation versioning**: store `rules_version` with each evaluation so old results stay explainable after thresholds change.
4. **Two-phase measurement for borderline values**: if a value is yellow/red, prompt "Rest 5 min and measure again" and store both readings.
5. **Personal baseline**: after 14 days, compute per-user baselines (median HR, BP, sleep) and use them in trend rules; show "vs your normal".
6. **Completeness score**: percent of essential indicators logged today; shown subtly, never as pressure.
7. **Export**: JSON + CSV export of all data, offline, for handing data to a surgeon if the link fails.
8. **Time-zone/clock**: handle spacecraft clock drift by trusting server time only for `serverTime` in sync; local `updatedAt` for ordering plus `version`.
9. **No hard dependency on any external API, CDN, font, map, or analytics.**
10. **Error UX**: every failure (storage full, sync failed) has a human message and a next step; storage quota check with warning.

---

## 18. Build Order (Milestones)

**M0. Project setup**: Next.js + Tailwind + PWA skeleton, FastAPI skeleton, `.env`, `DECISIONS.md`, lint/format/test tooling.
**M1. Rule engine (TS)** + `thresholds.ts` + unit tests with shared vectors. *(Everything depends on this; do it first.)*
**M2. Dexie schema + repositories**, **crew registry (register astronaut with name + unique crew ID + PIN), crew picker, PIN unlock, active-astronaut bar**, environment and mission dates, disclaimer.
**M3. Daily check-in wizard** -> save -> evaluation -> result screen.
**M4. Home dashboard** (status ring, indicator cards, actions) and **color-coded components**.
**M5. Trends/charts** with threshold bands and baselines.
**M6. 3D body** (React Three Fiber): procedural fallback body first, then GLB model, region hotspots, camera fly-to, status glow, region panel, `RegionList`, 2D fallback.
**M7. Reminders and notifications** (client scheduler + service worker).
**M8. Learn content** and how-to-measure sheets.
**M9. Gamification** (points, streak, badges, weekly challenge).
**M10. FastAPI**: models, Alembic migrations, auth, logs, evaluate, Python rule engine passing the same test vectors.
**M11. Sync** (outbox, push/pull, conflicts), sync status UI, Neon deployment and local SQLite mode.
**M12. Crew overview (commander/surgeon view of all astronauts by name and ID)**, roles on the API, audit log.
**M13. Empty states on every screen (Section 16)**, no-fake-data CI check, polish animations, accessibility pass, Lighthouse/Playwright offline tests.
**M14. Documentation**: README (run in all 3 modes), architecture diagram, rule catalogue, demo script.

**MVP cut line (if time is short): M0 to M6 + M7 basic + M9 basic.** Backend and sync (M10, M11) are enhancements; the product remains valid and fully functional without them.

---

## 19. Acceptance Criteria (Definition of Done)

- [ ] With network disabled, a user can onboard, complete a check-in, see results, view charts, open the 3D body, and receive a reminder.
- [ ] Data survives app reload and device restart.
- [ ] A fresh install has no astronauts and no logs; every screen shows its empty state.
- [ ] No hardcoded/seeded/random health data exists in app code (CI check passes).
- [ ] Multiple astronauts can be registered with unique name + crew ID; each sees only their own data; commander/surgeon sees all crew by name and ID (read-only).
- [ ] The 3D body renders, rotates, zooms, regions are clickable, coloured by the active astronaut's latest real evaluation, and it works offline (model bundled, no CDN). 2D fallback appears if WebGL is unavailable.
- [ ] Every status shown has colour + icon + text and an explanation of *why* (rule id and values).
- [ ] Red/critical results always display an escalation block with next steps.
- [ ] Combination rules (chest pain, CO2, infection, hypertension+symptoms, mood+insomnia) fire correctly in tests.
- [ ] Trend rules fire correctly on test fixtures (tests only) and show "need N more days" until enough real logs exist.
- [ ] Thresholds can be changed in config without touching components, and results change accordingly.
- [ ] Sync: after offline use, reconnecting pushes all data once (no duplicates) and pulls changes; conflicts never lose data.
- [ ] FastAPI runs with SQLite locally and Neon in cloud using only `DATABASE_URL` changes.
- [ ] TS and Python rule engines pass the same test vectors.
- [ ] Lighthouse: PWA installable, offline works; accessibility score >= 90.
- [ ] Disclaimer visible; no medication dosing anywhere.
- [ ] Every risk in Section 2.1 is mapped to inputs/rules or explicitly marked partly tracked/out of scope; Learn pages paraphrase (not copy) NASA text and list their sources.
- [ ] New rules `CMB-HYPOX-01`, `CMB-DCS-01`, `CMB-IMM-01`, `TRD-TEAM-01` have test vectors.

---

## 20. Presentation / Pitch Notes (for judging)

- **Story:** "Earth is unreachable, so the crew's phone-sized doctor must work with no internet."
- **Differentiators:** offline-first PWA, explainable rule engine linked to NASA's five hazards, interactive 3D body, trend-aware guidance, escalation to flight surgeon, gamification for adherence, works in 5 environments.
- **Demo order:** register 2 or 3 astronauts (name + crew ID) -> astronaut A completes a real check-in with values typed from the form -> show status, guidance and escalation -> open the 3D body, rotate and tap a region -> show trends (enter earlier days with the late-entry date picker beforehand) -> switch to astronaut B (separate data) -> commander crew overview showing everyone by name and ID -> turn off WiFi live, add a log, turn WiFi on, watch sync.
- **Honest limits slide:** thresholds are configurable defaults, not validated medical limits; not a medical device; next steps are wearable integration, flight-surgeon-validated ranges, and on-device ML for anomaly detection.

---

## Appendix A: Pydantic Models (starter)

```python
from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
from uuid import UUID
from typing import Optional, Literal

Status = Literal["green", "yellow", "red", "critical"]

class DailyLogIn(BaseModel):
    id: UUID
    log_date: date
    mission_day: Optional[int] = None
    heart_rate: Optional[int] = Field(None, ge=20, le=250)
    bp_systolic: Optional[int] = Field(None, ge=50, le=260)
    bp_diastolic: Optional[int] = Field(None, ge=30, le=160)
    glucose_mgdl: Optional[float] = Field(None, ge=20, le=600)
    temperature_c: Optional[float] = Field(None, ge=30, le=43)
    spo2: Optional[int] = Field(None, ge=50, le=100)
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    mood: Optional[int] = Field(None, ge=1, le=5)
    stress: Optional[int] = Field(None, ge=1, le=5)
    team_relations: Optional[int] = Field(None, ge=1, le=5)
    eva_today: bool = False
    weight_kg: Optional[float] = Field(None, ge=20, le=250)
    exercise_resistance_min: Optional[int] = Field(None, ge=0, le=600)
    exercise_cardio_min: Optional[int] = Field(None, ge=0, le=600)
    water_ml: Optional[int] = Field(None, ge=0, le=10000)
    calories: Optional[int] = Field(None, ge=0, le=10000)
    radiation_msv: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)
    version: int = 1
    updated_at: datetime

class SymptomIn(BaseModel):
    id: UUID
    symptom: str
    severity: int = Field(ge=1, le=3)

class EvaluationOut(BaseModel):
    overall: Status
    indicators: list[dict]
    flags: list[dict]
    trends: list[dict]
    actions: list[dict]
    escalation: Optional[dict]
    explanation: list[str]
    rules_version: str
```

## Appendix B: Rule Engine Skeleton (TypeScript)

```ts
// lib/rules/engine.ts
import { thresholds, RULES_VERSION } from "@/config/thresholds";

const rank: Record<Status, number> = { green: 0, yellow: 1, red: 2, critical: 3 };
const worst = (a: Status, b: Status) => (rank[a] >= rank[b] ? a : b);

export function evaluate(input: EvalInput): EvaluationResult {
  const indicators = evaluateBands(input.log, thresholds);       // 1
  const flags      = evaluateSymptoms(input.symptoms, input);    // 2
  const combos     = evaluateCombos(input, indicators);          // 3
  const trends     = evaluateTrends(input.history, input.log);   // 4
  const adjusted   = applyModifiers(                              // 5
    { indicators, flags: [...flags, ...combos], trends },
    input.mission
  );
  const overall = [...adjusted.indicators, ...adjusted.flags, ...adjusted.trends]
    .reduce<Status>((acc, x) => worst(acc, x.status), "green");  // 6
  const { actions, escalation, explanation } = buildGuidance(adjusted, overall, input); // 7
  return { overall, ...adjusted, actions, escalation, explanation, rulesVersion: RULES_VERSION } as EvaluationResult;
}
```

## Appendix C: Dexie Write + Outbox Pattern

```ts
export async function saveCheckin(db: AHMDB, payload: CheckinPayload) {
  await db.transaction("rw", [db.logs, db.symptoms, db.evaluations, db.gamification, db.outbox], async () => {
    const now = new Date().toISOString();
    await db.logs.put({ ...payload.log, updatedAt: now, version: (payload.log.version ?? 0) + 1 });
    await db.outbox.add({ entity: "daily_log", entityId: payload.log.id, op: "upsert", payload: payload.log, createdAt: now });
    // ...same for symptoms, evaluation, gamification
  });
  triggerSyncSoon(); // non-blocking; no-op when offline
}
```

## Appendix D: Online Detection (do not trust `navigator.onLine` alone)

```ts
export async function canReachBackend(baseUrl: string, timeoutMs = 2500) {
  if (!navigator.onLine) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseUrl}/api/v1/health`, { signal: ctrl.signal, cache: "no-store" });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}
```

## Appendix E: References, Attribution and Licensing

These are the resources listed on the NASA Space Apps challenge page, plus the per-risk pages linked from NASA's Risks page. Use them to write Learn content, verify guidance, and cite sources in the README and the app. Read the pages and cite specific facts you use; do not copy their text.

**Challenge note from the organisers:** NASA does not endorse any non-U.S. Government entity and is not responsible for information on non-U.S. Government websites; participants must comply with the data-use parameters (licences/terms) of every non-NASA website they use. Apply this to every third-party asset (3D models, icons, fonts, libraries) and record each licence and credit in the README.

### E.1 NASA Human Research Program (HRP)
- Five Hazards of Human Spaceflight: https://www.nasa.gov/hrp/hazards/
  - Space radiation: https://www.nasa.gov/hrp/hazard-space-radiation/
  - Isolation and confinement: https://www.nasa.gov/hrp/hazard-isolation-and-confinement/
  - Distance from Earth: https://www.nasa.gov/hrp/hazard-distance-from-earth/
  - Gravity fields: https://www.nasa.gov/hrp/hazard-gravity-fields/
  - Hostile/closed environments: https://www.nasa.gov/hrp/hazard-hostile-closed-environments/
- Risks of Human Spaceflight (overview): https://www.nasa.gov/hrp/risks/
- Ongoing HRP research in space: https://www.nasa.gov/hrp/ongoing-hrp-research/

### E.2 Per-risk reference pages (linked from the Risks page)
| Risk (Section 2.1 #) | URL |
|---|---|
| 1 Altered immune system responses | https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/ |
| 2 Altered sensorimotor and vestibular function | https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/ |
| 3 Cardiovascular adaptations | https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/ |
| 4 Decompression sickness | https://www.nasa.gov/reference/risk-of-decompression-sickness/ |
| 5 Host-microorganism interactions | https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/ |
| 6 Hypoxia | https://www.nasa.gov/reference/risk-of-hypoxia/ |
| 7 Inadequate food and nutrition | https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/ |
| 8 Injury and compromised performance from EVA | https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/ |
| 9 Reduced cardiorespiratory and musculoskeletal fitness | https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/ |
| 10 SANS | https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/ |
| 11 Spaceflight-induced bone changes | https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/ |
| 12 Behavioral conditions and psychiatric disorders | https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/ |
| 13 Inadequate teamwork | https://www.nasa.gov/reference/risk-of-inadequate-teamwork/ |
| 14 Inadequate sleep and irregular schedules | https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/ |
| 15 Injury from dynamic loads | https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/ |
| 16 Radiation-induced cancers | https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/ |
| 17 Inadequate systems operations support | https://www.nasa.gov/reference/risk-of-inadequate-systems-operations-support/ |

> If any URL has moved, take the current link from https://www.nasa.gov/hrp/risks/ and fix it here and in `content/risks.ts`.

### E.3 Canadian Space Agency (CSA) partner resources
- Monitoring Radiation for Astronaut Health: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp (use for the radiation indicator, dosimetry and "why track exposure" Learn text)
- Why Do We Conduct Science Experiments in Space?: https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp (background for the README/pitch)

### E.4 Other sources still needed (not provided by the challenge)
- NASA HRP pages mostly describe risks and countermeasures, not numeric limits. **Vital-sign default ranges** (HR, BP, glucose, temperature, SpO2, sleep) come from general adult clinical references. Choose reputable sources, put each in the indicator's `source` field in `config/thresholds.ts`, and keep `verified: false` until a human has checked it.
- ESA/JAXA public spaceflight-medicine material may be added if used; cite it the same way.

### E.5 How to use and credit sources in the product
1. **In the app:** every Learn page, risk card and body-region panel has a "Sources" list with the exact links used. Rule explanations show the rule id and, where relevant, the risk number from Section 2.1.
2. **In the README:** a References section (this appendix), a Third-party assets table (name, author, licence, link, what it is used for, modifications) covering the 3D body model, icons, fonts and libraries, and the challenge's NASA non-endorsement note.
3. **Wording:** say "built for the NASA Space Apps Challenge using public NASA HRP resources". Do not imply NASA endorsement or official status, and do not use NASA's logo or insignia unless the NASA brand guidelines (https://www.nasa.gov/nasa-brand-center/) and challenge rules allow it.
4. **Honesty:** state in the README and the pitch that thresholds are configurable defaults, not validated space-medicine limits, and that the app is not a medical device.
