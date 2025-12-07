// validate-logic.js
// Ejecutar con: node validate-logic.js

const fs = require("fs");
const path = require("path");

// Mapeo entre locale y archivo de lógica
const LOGIC_FILES = {
  en_US: "logic_en_US.json",
  es_AR: "logic_es_AR.json",
  es_MX: "logic_es_MX.json",
  pt_BR: "logic_pt_BR.json"
};

// Cache en memoria para no cargar el mismo JSON varias veces
const configCache = new Map();

function loadConfig(locale) {
  const fileName = LOGIC_FILES[locale];
  if (!fileName) {
    throw new Error(`No logic file configured for locale: ${locale}`);
  }
  if (configCache.has(locale)) {
    return configCache.get(locale);
  }
  const filePath = path.join(__dirname, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  configCache.set(locale, json);
  return json;
}

// ============================
// Motor de reglas (igual que en el front)
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
// Validaciones estructurales del config
// ============================

function validateConfigStructure(config, fileName) {
  const errors = [];
  const warnings = [];

  const questionIds = new Set(config.questions.map((q) => q.id));
  const varNames = new Set(Object.keys(config.variable_mapping));
  const messageKeys = new Set(Object.keys(config.messages));

  // 1) variable_mapping.from_question debe existir en questions
  for (const [varName, cfg] of Object.entries(config.variable_mapping)) {
    if (!questionIds.has(cfg.from_question)) {
      errors.push(
        `Config ${fileName}: variable "${varName}" refers to non-existing question "${cfg.from_question}".`
      );
    }
  }

  // 2) Cada condición en rules debe referenciar una variable existente
  for (const vac of config.rules.vaccines) {
    if (!vac.eligibility || !Array.isArray(vac.eligibility.groups)) continue;
    for (const group of vac.eligibility.groups) {
      if (!group.conditions) continue;
      for (const cond of group.conditions) {
        if (!varNames.has(cond.var)) {
          errors.push(
            `Config ${fileName}: vaccine "${vac.id}" uses variable "${cond.var}" which is not defined in variable_mapping.`
          );
        }
      }
    }

    // 3) Los message keys deben existir en messages
    const out = vac.output || {};
    if (out.eligible_message_key && !messageKeys.has(out.eligible_message_key)) {
      errors.push(
        `Config ${fileName}: vaccine "${vac.id}" uses eligible_message_key "${out.eligible_message_key}" not found in messages.`
      );
    }
    if (
      out.not_eligible_message_key &&
      !messageKeys.has(out.not_eligible_message_key)
    ) {
      errors.push(
        `Config ${fileName}: vaccine "${vac.id}" uses not_eligible_message_key "${out.not_eligible_message_key}" not found in messages.`
      );
    }
  }

  // 4) Warning si no hay preguntas o no hay vacunas
  if (!config.questions || config.questions.length === 0) {
    errors.push(`Config ${fileName}: no questions defined.`);
  }
  if (!config.rules || !config.rules.vaccines || config.rules.vaccines.length === 0) {
    errors.push(`Config ${fileName}: no vaccines rules defined.`);
  }

  return { errors, warnings };
}

// ============================
// Ejecución de tests
// ============================

function runTests() {
  const testFilePath = path.join(__dirname, "test-cases.json");
  const raw = fs.readFileSync(testFilePath, "utf8");
  const tests = JSON.parse(raw);

  let passed = 0;
  let failed = 0;
  const structuralErrors = [];

  // Validar estructura de cada config una vez
  for (const [locale, fileName] of Object.entries(LOGIC_FILES)) {
    try {
      const cfg = loadConfig(locale);
      const { errors, warnings } = validateConfigStructure(cfg, fileName);
      structuralErrors.push(...errors);
      if (warnings.length > 0) {
        console.log(`Warnings in ${fileName}:`);
        warnings.forEach((w) => console.log("  ⚠", w));
      }
    } catch (e) {
      structuralErrors.push(
        `Error loading config for locale ${locale}: ${e.message}`
      );
    }
  }

  if (structuralErrors.length > 0) {
    console.log("========================================");
    console.log("STRUCTURAL CONFIG ERRORS:");
    structuralErrors.forEach((e) => console.log("  ❌", e));
    console.log("========================================\n");
  } else {
    console.log("✅ No structural config errors detected.\n");
  }

  console.log("Running test cases...\n");

  for (const test of tests) {
    const { name, locale, answers, expected } = test;

    let result;
    try {
      const config = loadConfig(locale);
      result = runAssessment(answers, config);
    } catch (e) {
      console.log(`❌ [${name}] - ERROR running test: ${e.message}`);
      failed++;
      continue;
    }

    const mismatches = [];

    // Validar vacunas
    if (expected.vaccines) {
      for (const [vacId, expectedEligible] of Object.entries(
        expected.vaccines
      )) {
        const vacResult = result.vaccines.find((v) => v.id === vacId);
        if (!vacResult) {
          mismatches.push(
            `Expected vaccine "${vacId}" in result, but it was not found.`
          );
        } else if (vacResult.eligible !== expectedEligible) {
          mismatches.push(
            `Vaccine "${vacId}": expected eligible=${expectedEligible}, got ${vacResult.eligible}.`
          );
        }
      }
    }

    // Validar shouldShowLocator
    if (
      typeof expected.shouldShowLocator === "boolean" &&
      result.shouldShowLocator !== expected.shouldShowLocator
    ) {
      mismatches.push(
        `shouldShowLocator: expected ${expected.shouldShowLocator}, got ${result.shouldShowLocator}.`
      );
    }

    if (mismatches.length === 0) {
      console.log(`✅ [${name}]`);
      passed++;
    } else {
      console.log(`❌ [${name}]`);
      mismatches.forEach((m) => console.log("   -", m));
      failed++;
    }
  }

  console.log("\n========================================");
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log("========================================");
}

runTests();
