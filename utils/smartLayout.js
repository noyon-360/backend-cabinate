import { ENGINE, generateLayout, expandUnits, layoutScore } from "./layoutEngine.js";
import { aiSettings, suggestPlan } from "./llmLayout.js";

const better = (a, b) => {
  const [sa, sb] = [layoutScore(a), layoutScore(b)];
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
  return false;
};

/**
 * Rules layout, improved by the LLM when it can. If the AI layout fails any
 * check, the failures go back to the model for one corrected attempt
 * (within the same time budget). The best AI layout wins unless it scores
 * worse (more failed checks, or fewer cabinets placed) than the rules-only
 * one; any LLM failure falls back silently to the rules.
 *
 * `engine` in the result says which was used: "qwen3:8b+rules-v1" or
 * "rules-v1".
 */
export const generateSmartLayout = async (room, products) => {
  const rules = generateLayout(room, products);
  const settings = aiSettings();
  if (!settings.enabled) return rules;

  const { units } = expandUnits(products);
  if (units.length < 2) return rules; // nothing to arrange

  const engine = `${settings.model}+${ENGINE}`;
  const deadline = Date.now() + settings.timeoutMs;
  // Failed checks plus "did not fit" notes, so the model knows what to fix.
  const failedOf = (l) => [
    ...l.checks.filter((c) => !c.passed).map((c) => c.label),
    ...l.warnings.filter((w) => w.includes("did not fit")),
  ];

  let ai;
  try {
    const first = await suggestPlan(room, units, { deadline });
    ai = generateLayout(room, products, { plan: first.plan, engine });
    console.log(`[layout] ${settings.model} plan in ${first.ms} ms`, layoutScore(ai));

    const failed = failedOf(ai);
    if (failed.length) {
      try {
        const retry = await suggestPlan(room, units, {
          deadline,
          feedback: { plan: first.plan, failed },
        });
        const fixed = generateLayout(room, products, { plan: retry.plan, engine });
        console.log(`[layout] corrected plan in ${retry.ms} ms`, layoutScore(fixed));
        if (better(fixed, ai)) ai = fixed;
      } catch (err) {
        console.warn(`[layout] correction skipped: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[layout] ${settings.model} unavailable, using rules: ${err.message}`);
    return rules;
  }

  const useAi = !better(rules, ai);
  console.log(
    `[layout] ${useAi ? "using AI layout" : "rules scored better"}`,
    { ai: layoutScore(ai), rules: layoutScore(rules) }
  );
  return useAi ? ai : rules;
};
