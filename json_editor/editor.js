// Simple in-memory config
let logicConfig = null;

// UI selection state
let selectedQuestionIndex = null;
let selectedVarName = null;
let selectedRuleIndex = null;
let selectedMsgKey = null;

// Utility helpers
function $(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  const bar = $("status-bar");
  bar.textContent = message;
}

// Tabs
function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(`tab-${tab}`).classList.add("active");
      if (tab === "raw") {
        renderRawJson();
      }
    });
  });
}

// File loading
function initFileInput() {
  const input = $("file-input");
  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        logicConfig = normalizeConfig(json);
        afterConfigLoaded(`Loaded file: ${file.name}`);
      } catch (err) {
        console.error(err);
        setStatus("❌ Error parsing JSON file: " + err.message);
      }
    };
    reader.readAsText(file, "utf-8");
  });
}

// Normalize minimal structure in case some fields are missing
function normalizeConfig(cfg) {
  const config = { ...cfg };
  if (!config.meta) {
    config.meta = {
      market: "",
      assessment_id: "",
      version: "",
      language: ""
    };
  }
  if (!Array.isArray(config.questions)) config.questions = [];
  if (!config.variable_mapping) config.variable_mapping = {};
  if (!config.rules) config.rules = {};
  if (!Array.isArray(config.rules.vaccines)) config.rules.vaccines = [];
  if (!config.messages) config.messages = {};
  return config;
}

function afterConfigLoaded(message) {
  setStatus(message);
  $("download-btn").disabled = false;
  selectedQuestionIndex = null;
  selectedVarName = null;
  selectedRuleIndex = null;
  selectedMsgKey = null;
  renderAll();
}

// Download JSON
function initDownloadButton() {
  $("download-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    const blob = new Blob([JSON.stringify(logicConfig, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name =
      (logicConfig.meta && logicConfig.meta.assessment_id) ||
      "logic_config";
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// New empty config
function initNewEmptyButton() {
  $("new-empty-btn").addEventListener("click", () => {
    logicConfig = normalizeConfig({});
    afterConfigLoaded("Created new empty config (in memory).");
  });
}

// =========================
// Meta
// =========================

function renderMeta() {
  if (!logicConfig) return;
  const meta = logicConfig.meta || {};
  $("meta-market").value = meta.market || "";
  $("meta-assessment-id").value = meta.assessment_id || "";
  $("meta-version").value = meta.version || "";
  $("meta-language").value = meta.language || "";
}

function initMetaEditor() {
  $("meta-save-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    logicConfig.meta = {
      market: $("meta-market").value.trim(),
      assessment_id: $("meta-assessment-id").value.trim(),
      version: $("meta-version").value.trim(),
      language: $("meta-language").value.trim()
    };
    setStatus("✅ Meta saved.");
    renderRawJson();
  });
}

// =========================
// Questions
// =========================

function renderQuestionsList() {
  const list = $("questions-list");
  list.innerHTML = "";
  if (!logicConfig) return;

  logicConfig.questions.forEach((q, index) => {
    const li = document.createElement("li");
    if (index === selectedQuestionIndex) {
      li.classList.add("active");
    }
    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = q.id || "(no id)";

    const metaSpan = document.createElement("span");
    metaSpan.className = "meta";
    metaSpan.textContent = `${q.type || "?"} · ${q.label || ""}`;

    li.appendChild(labelSpan);
    li.appendChild(metaSpan);

    li.addEventListener("click", () => {
      selectedQuestionIndex = index;
      renderQuestionsList();
      openQuestionEditor();
    });

    list.appendChild(li);
  });

  if (selectedQuestionIndex == null) {
    $("question-editor-empty").hidden = false;
    $("question-editor").hidden = true;
  }
}

function openQuestionEditor() {
  if (!logicConfig || selectedQuestionIndex == null) return;
  const q = logicConfig.questions[selectedQuestionIndex];

  $("question-editor-empty").hidden = true;
  $("question-editor").hidden = false;

  $("q-id").value = q.id || "";
  $("q-type").value = q.type || "number";
  $("q-label").value = q.label || "";
  $("q-help-text").value = q.help_text || "";
  $("q-required").value = q.required ? "true" : "false";

  if (q.type === "number") {
    $("q-min-wrapper").style.display = "block";
    $("q-max-wrapper").style.display = "block";
    $("q-min").value =
      typeof q.min === "number" || typeof q.min === "string" ? q.min : "";
    $("q-max").value =
      typeof q.max === "number" || typeof q.max === "string" ? q.max : "";
  } else {
    $("q-min-wrapper").style.display = "none";
    $("q-max-wrapper").style.display = "none";
    $("q-min").value = "";
    $("q-max").value = "";
  }

  if (q.type === "single_choice" || q.type === "multi_choice") {
    $("q-options-wrapper").style.display = "block";
    renderQuestionOptionsTable(q.options || []);
  } else {
    $("q-options-wrapper").style.display = "none";
    $("q-options-body").innerHTML = "";
  }
}

function renderQuestionOptionsTable(options) {
  const tbody = $("q-options-body");
  tbody.innerHTML = "";
  (options || []).forEach((opt, idx) => {
    const tr = document.createElement("tr");

    const tdVal = document.createElement("td");
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.value = opt.value || "";
    valInput.dataset.optIndex = idx;
    valInput.dataset.field = "value";
    tdVal.appendChild(valInput);

    const tdLabel = document.createElement("td");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = opt.label || "";
    labelInput.dataset.optIndex = idx;
    labelInput.dataset.field = "label";
    tdLabel.appendChild(labelInput);

    const tdActions = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "✕";
    delBtn.className = "danger";
    delBtn.addEventListener("click", () => {
      if (!logicConfig || selectedQuestionIndex == null) return;
      const q = logicConfig.questions[selectedQuestionIndex];
      q.options.splice(idx, 1);
      renderQuestionOptionsTable(q.options);
    });
    tdActions.appendChild(delBtn);

    tr.appendChild(tdVal);
    tr.appendChild(tdLabel);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function collectQuestionFromEditor() {
  if (!logicConfig || selectedQuestionIndex == null) return;

  const q = logicConfig.questions[selectedQuestionIndex];
  q.id = $("q-id").value.trim();
  q.type = $("q-type").value;
  q.label = $("q-label").value.trim();
  q.help_text = $("q-help-text").value.trim() || undefined;
  q.required = $("q-required").value === "true";

  if (q.type === "number") {
    const minVal = $("q-min").value.trim();
    const maxVal = $("q-max").value.trim();
    q.min = minVal !== "" ? Number(minVal) : undefined;
    q.max = maxVal !== "" ? Number(maxVal) : undefined;
    q.options = undefined;
  } else {
    q.min = undefined;
    q.max = undefined;
    // read options table
    const rows = Array.from($("q-options-body").querySelectorAll("tr"));
    q.options = rows.map((row) => {
      const inputs = row.querySelectorAll("input");
      const value = inputs[0].value.trim();
      const label = inputs[1].value.trim();
      return { value, label };
    });
  }
}

function initQuestionsEditor() {
  $("question-add-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    const newQ = {
      id: "q_new_" + (logicConfig.questions.length + 1),
      type: "number",
      label: "New question",
      required: false
    };
    logicConfig.questions.push(newQ);
    selectedQuestionIndex = logicConfig.questions.length - 1;
    renderQuestionsList();
    openQuestionEditor();
    setStatus("Added new question.");
  });

  $("q-type").addEventListener("change", () => {
    if (!logicConfig || selectedQuestionIndex == null) return;
    const type = $("q-type").value;
    const q = logicConfig.questions[selectedQuestionIndex];
    q.type = type;
    openQuestionEditor();
  });

  $("q-add-option-btn").addEventListener("click", () => {
    if (!logicConfig || selectedQuestionIndex == null) return;
    const q = logicConfig.questions[selectedQuestionIndex];
    if (!Array.isArray(q.options)) q.options = [];
    q.options.push({ value: "", label: "" });
    renderQuestionOptionsTable(q.options);
  });

  $("q-save-btn").addEventListener("click", () => {
    collectQuestionFromEditor();
    renderQuestionsList();
    renderRawJson();
    setStatus("✅ Question saved.");
  });

  $("q-delete-btn").addEventListener("click", () => {
    if (!logicConfig || selectedQuestionIndex == null) return;
    const confirmDelete = confirm("Delete this question?");
    if (!confirmDelete) return;
    logicConfig.questions.splice(selectedQuestionIndex, 1);
    selectedQuestionIndex = null;
    renderQuestionsList();
    $("question-editor-empty").hidden = false;
    $("question-editor").hidden = true;
    renderRawJson();
    setStatus("Question deleted.");
  });
}

// =========================
// Variable mapping
// =========================

function renderVariablesList() {
  const list = $("variables-list");
  list.innerHTML = "";
  if (!logicConfig) return;

  const entries = Object.entries(logicConfig.variable_mapping || {});
  entries.forEach(([name, cfg]) => {
    const li = document.createElement("li");
    if (name === selectedVarName) li.classList.add("active");

    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = name;

    const metaSpan = document.createElement("span");
    metaSpan.className = "meta";
    metaSpan.textContent = `${cfg.type || "?"} · from: ${
      cfg.from_question || "?"
    }`;

    li.appendChild(labelSpan);
    li.appendChild(metaSpan);

    li.addEventListener("click", () => {
      selectedVarName = name;
      renderVariablesList();
      openVariableEditor(name);
    });

    list.appendChild(li);
  });

  if (!selectedVarName) {
    $("var-editor-empty").hidden = false;
    $("var-editor").hidden = true;
  }
}

function openVariableEditor(name) {
  if (!logicConfig) return;
  const cfg = logicConfig.variable_mapping[name];
  if (!cfg) return;

  $("var-editor-empty").hidden = true;
  $("var-editor").hidden = false;

  $("var-name").value = name;
  $("var-type").value = cfg.type || "number";
  $("var-from-question").value = cfg.from_question || "";

  if (cfg.type === "boolean") {
    $("var-boolean-config").style.display = "block";
    $("var-true-when").value = (cfg.true_when || []).join(",");
    $("var-true-when-any").value = (cfg.true_when_any_of || []).join(",");
  } else {
    $("var-boolean-config").style.display = "none";
    $("var-true-when").value = "";
    $("var-true-when-any").value = "";
  }
}

function collectVariableFromEditor(oldName) {
  if (!logicConfig) return;

  const newName = $("var-name").value.trim();
  const type = $("var-type").value;
  const fromQuestion = $("var-from-question").value.trim();

  if (!newName) {
    alert("Variable name cannot be empty.");
    return null;
  }
  if (!fromQuestion) {
    alert("from_question cannot be empty.");
    return null;
  }

  const newCfg = {
    from_question: fromQuestion,
    type: type
  };

  if (type === "boolean") {
    const trueWhenRaw = $("var-true-when").value.trim();
    const trueWhenAnyRaw = $("var-true-when-any").value.trim();

    if (trueWhenRaw) {
      newCfg.true_when = trueWhenRaw.split(",").map((s) => s.trim());
    }
    if (trueWhenAnyRaw) {
      newCfg.true_when_any_of = trueWhenAnyRaw
        .split(",")
        .map((s) => s.trim());
    }
  }

  // Rename key if needed
  if (oldName && oldName !== newName) {
    delete logicConfig.variable_mapping[oldName];
  }
  logicConfig.variable_mapping[newName] = newCfg;
  selectedVarName = newName;
  return newName;
}

function initVariablesEditor() {
  $("var-add-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    const name = "var_new_" + (Object.keys(logicConfig.variable_mapping).length + 1);
    logicConfig.variable_mapping[name] = {
      from_question: "",
      type: "number"
    };
    selectedVarName = name;
    renderVariablesList();
    openVariableEditor(name);
    setStatus("Added new variable.");
  });

  $("var-type").addEventListener("change", () => {
    const type = $("var-type").value;
    if (type === "boolean") {
      $("var-boolean-config").style.display = "block";
    } else {
      $("var-boolean-config").style.display = "none";
    }
  });

  $("var-save-btn").addEventListener("click", () => {
    if (!logicConfig || !selectedVarName) return;
    const updatedName = collectVariableFromEditor(selectedVarName);
    if (!updatedName) return;
    renderVariablesList();
    openVariableEditor(updatedName);
    renderRawJson();
    setStatus("✅ Variable saved.");
  });

  $("var-delete-btn").addEventListener("click", () => {
    if (!logicConfig || !selectedVarName) return;
    const confirmDelete = confirm("Delete this variable mapping?");
    if (!confirmDelete) return;
    delete logicConfig.variable_mapping[selectedVarName];
    selectedVarName = null;
    renderVariablesList();
    $("var-editor-empty").hidden = false;
    $("var-editor").hidden = true;
    renderRawJson();
    setStatus("Variable deleted.");
  });
}

// =========================
// Rules (vaccines)
// =========================

function renderRulesList() {
  const list = $("rules-list");
  list.innerHTML = "";
  if (!logicConfig || !logicConfig.rules || !logicConfig.rules.vaccines) return;

  logicConfig.rules.vaccines.forEach((vac, index) => {
    const li = document.createElement("li");
    if (index === selectedRuleIndex) li.classList.add("active");

    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = vac.id || "(no id)";

    const metaSpan = document.createElement("span");
    metaSpan.className = "meta";
    metaSpan.textContent = vac.label || "";

    li.appendChild(labelSpan);
    li.appendChild(metaSpan);

    li.addEventListener("click", () => {
      selectedRuleIndex = index;
      renderRulesList();
      openRuleEditor();
    });

    list.appendChild(li);
  });

  if (selectedRuleIndex == null) {
    $("rule-editor-empty").hidden = false;
    $("rule-editor").hidden = true;
  }
}

function openRuleEditor() {
  if (!logicConfig || selectedRuleIndex == null) return;
  const vac = logicConfig.rules.vaccines[selectedRuleIndex];

  $("rule-editor-empty").hidden = false;
  $("rule-editor").hidden = false;

  $("rule-id").value = vac.id || "";
  $("rule-label").value = vac.label || "";
  $("rule-description").value = vac.description || "";

  $("rule-eligibility").value = JSON.stringify(
    vac.eligibility || {},
    null,
    2
  );
  $("rule-output").value = JSON.stringify(vac.output || {}, null, 2);
}

function initRulesEditor() {
  $("rule-add-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    if (!logicConfig.rules) logicConfig.rules = {};
    if (!Array.isArray(logicConfig.rules.vaccines)) {
      logicConfig.rules.vaccines = [];
    }
    const newVac = {
      id: "vaccine_new_" + (logicConfig.rules.vaccines.length + 1),
      label: "New vaccine",
      description: "",
      eligibility: {
        logic: "OR",
        groups: []
      },
      output: {
        eligible_message_key: "",
        not_eligible_message_key: "",
        cta_type: "see_locations"
      }
    };
    logicConfig.rules.vaccines.push(newVac);
    selectedRuleIndex = logicConfig.rules.vaccines.length - 1;
    renderRulesList();
    openRuleEditor();
    setStatus("Added new vaccine rule.");
  });

  $("rule-save-btn").addEventListener("click", () => {
    if (!logicConfig || selectedRuleIndex == null) return;
    const vac = logicConfig.rules.vaccines[selectedRuleIndex];
    vac.id = $("rule-id").value.trim();
    vac.label = $("rule-label").value.trim();
    vac.description = $("rule-description").value.trim();

    try {
      const eligibility = JSON.parse($("rule-eligibility").value);
      vac.eligibility = eligibility;
    } catch (e) {
      alert("Eligibility JSON is invalid: " + e.message);
      return;
    }

    try {
      const output = JSON.parse($("rule-output").value);
      vac.output = output;
    } catch (e) {
      alert("Output JSON is invalid: " + e.message);
      return;
    }

    renderRulesList();
    renderRawJson();
    setStatus("✅ Vaccine rule saved.");
  });

  $("rule-delete-btn").addEventListener("click", () => {
    if (!logicConfig || selectedRuleIndex == null) return;
    const confirmDelete = confirm("Delete this vaccine rule?");
    if (!confirmDelete) return;
    logicConfig.rules.vaccines.splice(selectedRuleIndex, 1);
    selectedRuleIndex = null;
    renderRulesList();
    $("rule-editor-empty").hidden = false;
    $("rule-editor").hidden = true;
    renderRawJson();
    setStatus("Vaccine rule deleted.");
  });
}

// =========================
// Messages
// =========================

function renderMessagesList() {
  const list = $("messages-list");
  list.innerHTML = "";
  if (!logicConfig || !logicConfig.messages) return;

  const entries = Object.entries(logicConfig.messages);
  entries.forEach(([key, msg]) => {
    const li = document.createElement("li");
    if (key === selectedMsgKey) li.classList.add("active");

    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = key;

    const metaSpan = document.createElement("span");
    metaSpan.className = "meta";
    metaSpan.textContent = msg.title || "";

    li.appendChild(labelSpan);
    li.appendChild(metaSpan);

    li.addEventListener("click", () => {
      selectedMsgKey = key;
      renderMessagesList();
      openMessageEditor(key);
    });

    list.appendChild(li);
  });

  if (!selectedMsgKey) {
    $("msg-editor-empty").hidden = false;
    $("msg-editor").hidden = true;
  }
}

function openMessageEditor(key) {
  if (!logicConfig || !logicConfig.messages) return;
  const msg = logicConfig.messages[key];
  if (!msg) return;

  $("msg-editor-empty").hidden = false;
  $("msg-editor").hidden = false;

  $("msg-key").value = key;
  $("msg-title").value = msg.title || "";
  $("msg-body").value = msg.body || "";
}

function collectMessageFromEditor(oldKey) {
  if (!logicConfig) return;
  const newKey = $("msg-key").value.trim();
  const title = $("msg-title").value.trim();
  const body = $("msg-body").value;

  if (!newKey) {
    alert("Message key cannot be empty.");
    return null;
  }

  const newObj = { title, body };

  if (oldKey && oldKey !== newKey) {
    delete logicConfig.messages[oldKey];
  }
  logicConfig.messages[newKey] = newObj;
  selectedMsgKey = newKey;
  return newKey;
}

function initMessagesEditor() {
  $("msg-add-btn").addEventListener("click", () => {
    if (!logicConfig) return;
    const newKey = "message_new_" + (Object.keys(logicConfig.messages).length + 1);
    logicConfig.messages[newKey] = {
      title: "New message",
      body: ""
    };
    selectedMsgKey = newKey;
    renderMessagesList();
    openMessageEditor(newKey);
    setStatus("Added new message.");
  });

  $("msg-save-btn").addEventListener("click", () => {
    if (!logicConfig || !selectedMsgKey) return;
    const updatedKey = collectMessageFromEditor(selectedMsgKey);
    if (!updatedKey) return;
    renderMessagesList();
    openMessageEditor(updatedKey);
    renderRawJson();
    setStatus("✅ Message saved.");
  });

  $("msg-delete-btn").addEventListener("click", () => {
    if (!logicConfig || !selectedMsgKey) return;
    const confirmDelete = confirm("Delete this message?");
    if (!confirmDelete) return;
    delete logicConfig.messages[selectedMsgKey];
    selectedMsgKey = null;
    renderMessagesList();
    $("msg-editor-empty").hidden = false;
    $("msg-editor").hidden = true;
    renderRawJson();
    setStatus("Message deleted.");
  });
}

// =========================
// Raw JSON tab
// =========================

function renderRawJson() {
  if (!logicConfig) {
    $("raw-json").value = "";
    return;
  }
  $("raw-json").value = JSON.stringify(logicConfig, null, 2);
}

// =========================
// Render all
// =========================

function renderAll() {
  if (!logicConfig) return;
  renderMeta();
  renderQuestionsList();
  renderVariablesList();
  renderRulesList();
  renderMessagesList();
  renderRawJson();
}

// =========================
// Init
// =========================

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initFileInput();
  initDownloadButton();
  initNewEmptyButton();
  initMetaEditor();
  initQuestionsEditor();
  initVariablesEditor();
  initRulesEditor();
  initMessagesEditor();
  setStatus("Ready. Load a config file or create a new one.");
});
