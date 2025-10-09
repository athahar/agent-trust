/**
 * Computes the risk score for a given transaction based on triggered rules.
 * @param {object} txn - The transaction object.
 * @param {Array<object>} triggered - An array of triggered rule objects.
 * @returns {number} The calculated risk score (0-100).
 */
export async function computeRiskScore(txn, triggered) {
  let risk_score = 50; // Start with a baseline score
  const score_increment_block = 40; // Significant increase for block
  const score_increment_review = 20; // Moderate increase for review

  for (const rule of triggered) {
    if (rule.decision === 'block') {
      risk_score += score_increment_block;
    } else if (['review', 'flag_review'].includes(rule.decision)) {
      risk_score += score_increment_review;
    }
    // Optionally, you could decrease score for 'allow' rules if they exist and are triggered
  }

  // Cap the score between 0 and 100
  risk_score = Math.max(0, Math.min(100, risk_score));

  return risk_score;
} 