# Respiratory Vaccine Eligibility – JSON-Driven Prototype

This prototype shows how to drive a **multi-step eligibility assessment** from a **JSON configuration file** (`logic.json`), without changing any JavaScript or UI code.

> ⚠️ **Important:** All questions, rules and outputs are **demo-only** and are **not medical advice**. In production, clinical and legal teams must define and approve all content and logic.

---

## 1. Project structure

```text
/
├─ index.html      # UI shell: layout + container for the assessment
├─ styles.css      # Basic styling (multi-step form + results)
├─ script.js       # Assessment engine + navigation + rendering
└─ logic.json      # 🔑 All questions + variables + rules + messages
```

Only `logic.json` is meant to be edited by non-developers to change the assessment behavior.

---

## 2. How the engine works (high level)

1. **`index.html`** loads `script.js` and displays a card for one question at a time (multi-step wizard).
2. **`script.js`**:

   * `fetch("logic.json")` and stores it as `appState.config`.
   * Renders each question from `config.questions[]`.
   * Collects user answers into `appState.answers`.
   * After the last question, calls `runAssessment(answers, config)`.
3. **`runAssessment`**:

   * Uses `config.variable_mapping` to convert raw answers → business variables (e.g. `age`, `has_chronic_condition`, `is_pregnant`).
   * Evaluates `config.rules.vaccines[]` for each vaccine.
   * Picks the right messages from `config.messages`.
   * Sets `shouldShowLocator` to tell the UI if it should “hand off” to a locator map.

All of this behavior can be changed by editing the JSON, without touching `script.js`.

---

## 3. Anatomy of `logic.json`

Top-level keys:

```jsonc
{
  "meta": { ... },
  "questions": [ ... ],
  "variable_mapping": { ... },
  "rules": { ... },
  "messages": { ... }
}
```

### 3.1 `meta`

```json
"meta": {
  "market": "US",
  "assessment_id": "respiratory_vaccines_demo",
  "version": "2025-01-01",
  "language": "en-US"
}
```

* **What it’s for:** metadata (for versioning, markets, documentation).
* **What you can change:**

  * `market` → e.g. `"US"`, `"AR"`, `"MX"`.
  * `assessment_id` → free text ID.
  * `version` → useful for tracking rule updates.
  * `language` → informational only in this prototype.

The JS engine doesn’t use `meta` for logic — it’s just descriptive.

---

### 3.2 `questions`: multi-step UI definition

Each object in `questions[]` defines **one step** in the wizard.

Example:

```json
{
  "id": "q_age",
  "type": "number",
  "label": "How old are you?",
  "min": 18,
  "max": 120,
  "required": true
}
```

Supported types (in this prototype):

1. `"number"`
2. `"single_choice"` (radio buttons)
3. `"multi_choice"` (checkboxes)

#### Common fields

* `id` (string, **required**)
  Unique key used to store answers and referenced in `variable_mapping`.

* `type` (string, **required**)
  `"number" | "single_choice" | "multi_choice"`

* `label` (string, **required**)
  Question text shown to the user.

* `help_text` (string, optional)
  Extra explanatory text.

* `required` (boolean, optional, default `false`)
  If `true`, the Next button will show an error if nothing is selected/filled.

#### Type-specific fields

##### `type: "number"`

```json
{
  "id": "q_age",
  "type": "number",
  "label": "How old are you?",
  "min": 18,
  "max": 120,
  "required": true
}
```

* `min` / `max` (optional) → basic validation.

##### `type: "single_choice"`

```json
{
  "id": "q_pregnant",
  "type": "single_choice",
  "label": "Are you currently pregnant...?",
  "required": true,
  "options": [
    { "value": "yes", "label": "Yes" },
    { "value": "no", "label": "No" }
  ]
}
```

* `options[]` (**required**):

  * `value`: internal code (used in `variable_mapping`).
  * `label`: text shown to the user.

##### `type: "multi_choice"`

```json
{
  "id": "q_conditions",
  "type": "multi_choice",
  "label": "Do you have any of the following conditions?",
  "help_text": "Select all that apply.",
  "options": [
    { "value": "heart_disease", "label": "Heart disease" },
    { "value": "none", "label": "None of the above" }
  ]
}
```

* `options[]` same as `single_choice`.
* Special behavior: if `"none"` is selected, the UI forces `["none"]` and ignores other selections.

---

### 3.3 `variable_mapping`: raw answers → business variables

This section turns question-level answers into simpler variables the rules engine can work with.

Example:

```json
"variable_mapping": {
  "age": {
    "from_question": "q_age",
    "type": "number"
  },
  "has_chronic_condition": {
    "from_question": "q_conditions",
    "type": "boolean",
    "true_when_any_of": [
      "heart_disease",
      "lung_disease",
      "diabetes",
      "kidney_disease",
      "weak_immune"
    ]
  }
}
```

For each variable:

* `from_question` → `id` of the question in `questions[]`

* `type` → `"number"` or `"boolean"` in this prototype

* For `"number"`:

  * The engine does `Number(answers[from_question])`.

* For `"boolean"`:

  * If `true_when` is present:

    ```json
    "true_when": ["yes"]
    ```

    → variable is `true` when the raw answer **equals** any of those values.
  * If `true_when_any_of` is present:

    ```json
    "true_when_any_of": ["covid19", "flu"]
    ```

    → variable is `true` when the raw answer (array) includes **any** of them.

Intermediate output looks like:

```json
{
  "age": 72,
  "has_chronic_condition": true,
  "lives_in_ltc": false,
  "is_pregnant": false,
  "has_recent_covid19_vaccine": false
}
```

---

### 3.4 `rules`: eligibility per vaccine

`rules.vaccines[]` is where you define **who might be eligible** in this demo.

Example (simplified):

```json
{
  "id": "covid19",
  "label": "COVID-19 vaccine",
  "description": "Demo-only logic for potential COVID-19 vaccine eligibility.",
  "eligibility": {
    "logic": "OR",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 65 }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 18 },
          { "var": "has_chronic_condition", "op": "==", "value": true }
        ]
      }
    ]
  },
  "output": {
    "eligible_message_key": "covid19_eligible",
    "not_eligible_message_key": "covid19_not_eligible",
    "cta_type": "see_locations"
  }
}
```

#### Fields:

* `id` → internal code for the vaccine.

* `label` → display name.

* `description` → short text shown in results (demo only).

* `eligibility` → rule tree:

  * `logic` at top level: `"OR"` or `"AND"` across **groups**.
  * `groups[]`: each has:

    * `logic`: `"AND"` or `"OR"` across **conditions**.
    * `conditions[]`: each condition is:

      * `var`: name of a variable from `variable_mapping`.
      * `op`: `"=="`, `"!="`, `">="`, `"<="`, `">"`, `"<"`.
      * `value`: what to compare against (number or boolean).

* `output`:

  * `eligible_message_key`: key into `messages`.
  * `not_eligible_message_key`: key into `messages`.
  * `cta_type`: `"see_locations"` in this demo (controls locator hint).

The engine returns, per vaccine:

```json
{
  "id": "covid19",
  "label": "COVID-19 vaccine",
  "eligible": true,
  "messageTitle": "...",
  "messageBody": "...",
  "cta_type": "see_locations"
}
```

---

### 3.5 `messages`: text for results

Keys referenced from `rules.vaccines[].output.*_message_key`.

Example:

```json
"messages": {
  "covid19_eligible": {
    "title": "You may be eligible for a COVID-19 vaccine.",
    "body": "Based on this demo logic, you might be eligible..."
  },
  "covid19_not_eligible": {
    "title": "You may not be in a group prioritized in this demo.",
    "body": "This tool is for demonstration only..."
  }
}
```

You can safely change **any text** here (titles & body), as long as the keys stay consistent with `rules`.

---

## 4. Examples: changing logic by editing only `logic.json`

### Example 1 – Change age threshold for flu

Current snippet (in `rules.vaccines`):

```json
{
  "id": "flu",
  "label": "Flu (influenza) vaccine",
  "eligibility": {
    "logic": "OR",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 65 }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 50 },
          { "var": "has_chronic_condition", "op": "==", "value": true }
        ]
      }
    ]
  },
  ...
}
```

**Goal:** make the first group start at age 60 instead of 65.

Just change the `value`:

```json
{ "var": "age", "op": ">=", "value": 60 }
```

No JS/HTML changes required.

---

### Example 2 – Add a new chronic condition

You want to add “obesity” as another chronic condition.

1. **Add an option to the question:**

```json
{
  "id": "q_conditions",
  "type": "multi_choice",
  "label": "Have you ever been told...?",
  "options": [
    { "value": "heart_disease", "label": "Heart disease" },
    { "value": "lung_disease", "label": "Chronic lung disease" },
    { "value": "diabetes", "label": "Diabetes" },
    { "value": "kidney_disease", "label": "Chronic kidney disease" },
    { "value": "obesity", "label": "Obesity" },            // 👈 NEW
    { "value": "weak_immune", "label": "Weakened immune system" },
    { "value": "none", "label": "None of the above" }
  ]
}
```

2. **Include it in `has_chronic_condition`:**

```json
"has_chronic_condition": {
  "from_question": "q_conditions",
  "type": "boolean",
  "true_when_any_of": [
    "heart_disease",
    "lung_disease",
    "diabetes",
    "kidney_disease",
    "obesity",         // 👈 NEW
    "weak_immune"
  ]
}
```

All rules referencing `has_chronic_condition` now automatically consider “obesity” as a chronic condition.

---

### Example 3 – Make pregnancy influence RSV eligibility

Let’s say you want RSV to be “potentially eligible” if:

* Age ≥ 60 **OR**
* Pregnant (demo rule) **OR**
* Age ≥ 18 + chronic condition (as before)

Current RSV rule:

```json
{
  "id": "rsv",
  "label": "RSV vaccine",
  "eligibility": {
    "logic": "OR",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 60 }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 18 },
          { "var": "has_chronic_condition", "op": "==", "value": true }
        ]
      }
    ]
  },
  ...
}
```

1. Make sure `is_pregnant` is mapped (already there):

```json
"is_pregnant": {
  "from_question": "q_pregnant",
  "type": "boolean",
  "true_when": ["yes"]
}
```

2. Add a new group:

```json
{
  "id": "rsv",
  ...
  "eligibility": {
    "logic": "OR",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 60 }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 18 },
          { "var": "has_chronic_condition", "op": "==", "value": true }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "var": "is_pregnant", "op": "==", "value": true }
        ]
      }
    ]
  },
  ...
}
```

Now anyone with `is_pregnant === true` will be considered “eligible (demo)” for RSV in the prototype.

---

### Example 4 – Disable a vaccine without touching JS

If you temporarily don’t want to show RSV:

* Remove the RSV block from `rules.vaccines[]` **OR**
* Leave it and make the rule impossible to match (e.g. age ≥ 999).

**Option A – hard disable:**

```json
"rules": {
  "vaccines": [
    { ... covid19 ... },
    { ... flu ... },
    { ... pneumo ... }
    // RSV removed
  ]
}
```

**Option B – logically unreachable (for testing):**

```json
{
  "id": "rsv",
  ...
  "eligibility": {
    "logic": "AND",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "var": "age", "op": ">=", "value": 999 }
        ]
      }
    ]
  }
}
```

---

### Example 5 – Create a variant per market

You can keep **one JS codebase** and multiple JSON files, for example:

```text
logic_us.json
logic_ar.json
logic_mx.json
```

Each file can:

* Change `meta.market`, `meta.language`.
* Adjust questions (e.g. different wording, local calendars).
* Adjust `variable_mapping` (e.g. map new questions).
* Adjust `rules` (e.g. different age thresholds per market).
* Translate `messages`.

To wire this up, you’d just add a “market selector” in JS that loads the right JSON file instead of always `logic.json`. The rules engine doesn’t change.

---

## 5. Running the prototype locally

Because `script.js` uses `fetch("logic.json")`, you should serve the files over HTTP (not open the HTML file directly):

From the project folder:

```bash
# Option A: Python 3
python -m http.server 8000

# Option B: Node (if you have it)
npx serve .
```

Then open:

* [http://localhost:8000](http://localhost:8000) (or the port you used)

And start playing with `logic.json`. Every change is picked up on refresh, with no code changes required.

---
