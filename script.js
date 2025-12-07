// Mapping between locale and JSON file
const logicFiles = {
  en_US: "logic_en_US.json",
  es_AR: "logic_es_AR.json",
  es_MX: "logic_es_MX.json",
  pt_BR: "logic_pt_BR.json"
};

// Simple app state
const appState = {
  config: null,
  currentIndex: 0,
  answers: {},
  currentLocale: "en_US"
};

document.addEventListener("DOMContentLoaded", () => {
  const questionCard = document.getElementById("question-card");
  const resultsCard = document.getElementById("results-card");
  const backButton = document.getElementById("back-button");
  const nextButton = document.getElementById("next-button");
  const restartButton = document.getElementById("restart-button");
  const logicSelect = document.getElementById("logic-select");
  const errorEl = document.getElementById("error-message");
  const stepIndicator = document.getElementById("step-indicator");
  const questionLabel = document.getElementById("question-label");
  const questionHelp = document.getElementById("question-help");
  const questionInput = document.getElementById("question-input");

  function resetUIForLoading() {
    questionCard.hidden = false;
    resultsCard.hidden = false; // show card but with "Loading"
    resultsCard.hidden = true;  // ensure results are hidden
    stepIndicator.textContent = "Loading assessment…";
    questionLabel.textContent = "";
    questionHelp.textContent = "";
    questionInput.innerHTML = "";
    errorEl.textContent = "";
  }

  function loadConfig(locale) {
    const file = logicFiles[locale] || logicFiles["en_US"];
    appState.currentLocale = locale;
    appState.config = null;
    appState.currentIndex = 0;
    appState.answers = {};

    resetUIForLoading();

    fetch(file)
      .then((res) => res.json())
      .then((config) => {
        appState.config = config;
        appState.currentIndex = 0;
        appState.answers = {};
        renderQuestion();
      })
      .catch((err) => {
        console.error("Error loading config:", err);
        errorEl.textContent =
          "There was a problem loading the assessment configuration.";
      });
  }

  backButton.addEventListener("click", () => {
    if (!appState.config) return;
    if (appState.currentIndex > 0) {
      appState.currentIndex -= 1;
      renderQuestion();
    }
  });

  nextButton.addEventListener("click", () => {
    if (!appState.config) return;
    const ok = collectCurrentAnswer();
    if (!ok) return;

    const lastIndex = appState.config.questions.length - 1;
    if (appState.currentIndex === lastIndex) {
      const result = runAssessment(appState.answers, appState.config);
      renderResults(result);
      questionCard.hidden = true;
      resultsCard.hidden = false;
    } else {
      appState.currentIndex += 1;
      renderQuestion();
    }
  });

  restartButton.addEventListener("click", () => {
    if (!appState.config) return;
    appState.currentIndex = 0;
    appState.answers = {};
    resultsCard.hidden = true;
    questionCard.hidden = false;
    renderQuestion();
  });

  logicSelect.addEventListener("change", (e) => {
    const locale = e.target.value;
    loadConfig(locale);
  });

  // Initial load (default option in the select)
  loadConfig(logicSelect.value);
});

// Render the current question (multi-step UI)
function renderQuestion() {
  const cfg = appState.config;
  if (!cfg) return;

  const questions = cfg.questions;
  const idx = appState.currentIndex;
  const question = questions[idx];

  const stepIndicator = document.getElementById("step-indicator");
  const labelEl = document.getElementById("question-label");
  const helpEl = document.getElementById("question-help");
  const inputContainer = document.getElementById("question-input");
  const errorEl = document.getElementById("error-message");
  const backButton = document.getElementById("back-button");
  const nextButton = document.getElementById("next-button");

  const totalSteps = questions.length;
  stepIndicator.textContent = `Step ${idx + 1} of ${totalSteps}`;

  labelEl.textContent = question.label || "";
  if (question.help_text) {
    helpEl.textContent = question.help_text;
    helpEl.style.display = "block";
  } else {
    helpEl.textContent = "";
    helpEl.style.display = "none";
  }

  errorEl.textContent = "";

  // Previous answer (if any)
  const previousValue = appState.answers[question.id];

  // Build input control
  let html = "";

  if (question.type === "number") {
    const minAttr = question.min != null ? `min="${question.min}"` : "";
    const maxAttr = question.max != null ? `max="${question.max}"` : "";
    const valueAttr =
      previousValue != null && previousValue !== ""
        ? `value="${previousValue}"`
        : "";
    html = `
      <input
        type="number"
        id="input_${question.id}"
        name="${question.id}"
        ${minAttr}
        ${maxAttr}
        ${valueAttr}
      />
    `;
  } else if (
    question.type === "single_choice" ||
    question.type === "multi_choice"
  ) {
    const inputType = question.type === "single_choice" ? "radio" : "checkbox";
    const optionsHtml = (question.options || [])
      .map((opt, i) => {
        const isChecked =
          question.type === "single_choice"
            ? previousValue === opt.value
            : Array.isArray(previousValue) &&
              previousValue.includes(opt.value);
        const checkedAttr = isChecked ? "checked" : "";
        const inputId = `${question.id}_${i}`;
        return `
          <label class="option" for="${inputId}">
            <input
              type="${inputType}"
              id="${inputId}"
              name="${question.id}"
              value="${opt.value}"
              ${checkedAttr}
            />
            <span>${opt.label}</span>
          </label>
        `;
      })
      .join("");
    html = `<div class="option-group">${optionsHtml}</div>`;
  } else {
    html = "<p>Unsupported question type in this demo.</p>";
  }

  inputContainer.innerHTML = html;

  // Nav buttons
  backButton.disabled = idx === 0;
  nextButton.textContent =
    idx === totalSteps - 1 ? "See my results" : "Next";
}

// Collect current answer and validate
function collectCurrentAnswer() {
  const cfg = appState.config;
  const question = cfg.questions[appState.currentIndex];
  const errorEl = document.getElementById("error-message");
  errorEl.textContent = "";

  let value = null;

  if (question.type === "number") {
    const input = document.getElementById(`input_${question.id}`);
    if (!input) return false;
    const raw = input.value.trim();

    if (question.required && !raw) {
      errorEl.textContent = "Please enter your age to continue.";
      return false;
    }

    if (!raw) {
      value = null;
    } else {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        errorEl.textContent = "Please enter a valid number.";
        return false;
      }
      if (question.min != null && num < question.min) {
        errorEl.textContent = `Please enter an age of at least ${question.min}.`;
        return false;
      }
      if (question.max != null && num > question.max) {
        errorEl.textContent = `Please enter an age no greater than ${question.max}.`;
        return false;
      }
      value = num;
    }
  } else if (question.type === "single_choice") {
    const selected = document.querySelector(
      `input[name="${question.id}"]:checked`
    );
    if (question.required && !selected) {
      errorEl.textContent = "Please select an option to continue.";
      return false;
    }
    value = selected ? selected.value : null;
  } else if (question.type === "multi_choice") {
    const selectedEls = Array.from(
      document.querySelectorAll(`input[name="${question.id}"]:checked`)
    );
    const selectedValues = selectedEls.map((el) => el.value);

    if (question.required && selectedValues.length === 0) {
      errorEl.textContent = "Please select at least one option to continue.";
      return false;
    }

    // If "none" is selected, override any other selections
    if (selectedValues.includes("none")) {
      value = ["none"];
    } else {
      value = selectedValues;
    }
  } else {
    // Unsupported type in this demo
    return true;
  }

  appState.answers[question.id] = value;
  return true;
}

// ============================
// Rule engine
// ============================

function compare(lhs, op, rhs) {
  switch (op) {
    case "==":
      return lhs === rhs;
    case "!=":
      return lhs !== rhs;
    case ">=":
      return lhs >= rhs;
    case "<=":
      return lhs <= rhs;
    case ">":
      return lhs > rhs;
    case "<":
      return lhs < rhs;
    default:
      throw new Error("Unsupported operator: " + op);
  }
}

function evaluateCondition(vars, condition) {
  const { var: varName, op, value } = condition;
  const lhs = vars[varName];
  return compare(lhs, op, value);
}

function evaluateGroup(vars, group) {
  const { logic, conditions } = group;
  if (logic === "AND") {
    return conditions.every((c) => evaluateCondition(vars, c));
  }
  if (logic === "OR") {
    return conditions.some((c) => evaluateCondition(vars, c));
  }
  throw new Error("Unsupported group logic: " + logic);
}

function evaluateEligibility(vars, eligibility) {
  const { logic, groups } = eligibility;
  if (logic === "OR") {
    return groups.some((g) => evaluateGroup(vars, g));
  }
  if (logic === "AND") {
    return groups.every((g) => evaluateGroup(vars, g));
  }
  throw new Error("Unsupported eligibility logic: " + logic);
}

function buildVariables(answers, mapping) {
  const vars = {};
  for (const [varName, cfg] of Object.entries(mapping)) {
    const raw = answers[cfg.from_question];
    if (cfg.type === "number") {
      vars[varName] = raw != null ? Number(raw) : null;
    } else if (cfg.type === "boolean") {
      if (cfg.true_when) {
        vars[varName] = cfg.true_when.includes(raw);
      } else if (cfg.true_when_any_of) {
        const arr = Array.isArray(raw) ? raw : [];
        vars[varName] = arr.some((v) => cfg.true_when_any_of.includes(v));
      } else {
        vars[varName] = Boolean(raw);
      }
    } else {
      vars[varName] = raw;
    }
  }
  return vars;
}

function runAssessment(answers, config) {
  const variables = buildVariables(answers, config.variable_mapping);

  const vaccines = config.rules.vaccines.map((vac) => {
    const isEligible = evaluateEligibility(variables, vac.eligibility);
    const msgKey = isEligible
      ? vac.output.eligible_message_key
      : vac.output.not_eligible_message_key;
    const msg = config.messages[msgKey] || {
      title: "Demo result",
      body: "No message configured."
    };

    return {
      id: vac.id,
      label: vac.label,
      description: vac.description,
      eligible: isEligible,
      messageTitle: msg.title,
      messageBody: msg.body,
      cta_type: vac.output.cta_type
    };
  });

  const shouldShowLocator = vaccines.some(
    (v) => v.eligible && v.cta_type === "see_locations"
  );

  return {
    variables,
    vaccines,
    shouldShowLocator
  };
}

// ============================
// Render results
// ============================

function renderResults(result) {
  const varsContainer = document.getElementById("variables-summary");
  const vaccinesContainer = document.getElementById("vaccines-summary");
  const locatorContainer = document.getElementById("locator-message");

  // Variables
  const varsHtmlItems = Object.entries(result.variables)
    .map(([key, value]) => {
      return `<div class="variable-item"><strong>${key}</strong>: ${String(
        value
      )}</div>`;
    })
    .join("");

  varsContainer.innerHTML = `
    <h3>Calculated variables (demo)</h3>
    <div class="variables-list">
      ${varsHtmlItems || "<span class='small-text'>No variables</span>"}
    </div>
  `;

  // Vaccines
  const vaccinesHtml = result.vaccines
    .map((v) => {
      const pillClass = v.eligible ? "pill-eligible" : "pill-not-eligible";
      const pillText = v.eligible ? "Eligible (demo)" : "Not eligible (demo)";
      return `
        <div class="vaccine-result">
          <div class="vaccine-header">
            <strong>${v.label}</strong>
            <span class="pill ${pillClass}">${pillText}</span>
          </div>
          <div class="vaccine-body">
            <div><em>${v.description || ""}</em></div>
            <div style="margin-top:4px;">
              <strong>${v.messageTitle}</strong><br />
              <span>${v.messageBody}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  vaccinesContainer.innerHTML = `
    <h3>Vaccine evaluation (demo)</h3>
    ${vaccinesHtml || "<p>No vaccines configured.</p>"}
  `;

  if (result.shouldShowLocator) {
    locatorContainer.innerHTML = `
      <div class="locator-message">
        In a real implementation, this is where the experience
        would hand off to a vaccine locator map with nearby
        locations based on your market and preferences.
      </div>
    `;
  } else {
    locatorContainer.innerHTML = `
      <div class="locator-message">
        In this demo, none of the sample rules triggered the locator.
        A real tool could still offer general vaccine information
        or suggest speaking with a healthcare professional.
      </div>
    `;
  }
}
