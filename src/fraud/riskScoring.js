
/**
 * Compute a robust risk score (0 = low risk, 100 = highest risk)
 * Applies industry-style logic across multiple fraud signals.
 */
export function computeRiskScore(txn, userHistory = []) {
    let score = 0;
    const now = new Date(txn.timestamp);
  
    // ---------- 1. Known high-risk countries/sellers (static config) ----------
    const riskyCountries = ['NG', 'RU', 'PK'];
    const riskySellers = ['ShadyElectronics', 'QuickLoanz'];
  
    if (txn.country && riskyCountries.includes(txn.country)) score += 20;
    if (riskySellers.includes(txn.seller_name)) score += 20;
  
    // ---------- 2. New accounts ----------
    if (txn.account_age_days != null && txn.account_age_days < 14) {
      score += 15;
    }
  
    // ---------- 3. Transaction velocity (too many in short time) ----------
    const recentTxns = userHistory.filter(t => {
      const diff = Math.abs(new Date(t.timestamp) - now);
      return diff < 5 * 60 * 1000; // last 5 mins
    });
    if (recentTxns.length >= 3) score += 20;
  
    // ---------- 4. Amount outlier (3x the user's median amount) ----------
    const amounts = userHistory.map(t => t.amount).filter(Boolean).sort((a, b) => a - b);
    const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
    if (median > 0 && txn.amount > median * 3) score += 10;
  
    // ---------- 5. New device or delegation (first seen) ----------
    const seenDevices = new Set(userHistory.map(t => t.device));
    if (!seenDevices.has(txn.device)) score += 10;
  
    if (txn.delegated && txn.delegation_duration_hours < 1) {
      score += 8;
    }
  
    // ---------- 6. Known good partners → small deduction ----------
    const safePartners = ['Stripe', 'Amazon', 'Shopify'];
    if (safePartners.includes(txn.partner)) score -= 5;
  
    // ---------- 7. History consistency (many safe txns before) ----------
    const priorSafe = userHistory.filter(t => t.risk_score != null && t.risk_score < 20).length;
    if (priorSafe >= 10) score -= 10;
  
    // ---------- 8. Matching known suspicious SKUs/tags ----------
    if (txn.risk_tags?.includes('unlisted_item') || txn.risk_tags?.includes('exploit_attempt')) {
      score += 25;
    }
  
    // ---------- Clamp score to 0–100 ----------
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  