#!/bin/bash
# migrations/004_update_code_references.sh
# Updates all code references to use atd_ prefix for tables
# Usage: bash migrations/004_update_code_references.sh

set -e

echo "🔄 Updating code references to atd_* tables..."
echo ""

# Function to update files
update_files() {
  local old_pattern="$1"
  local new_pattern="$2"
  local description="$3"

  echo "📝 Updating: $description"
  echo "   Pattern: $old_pattern → $new_pattern"

  # Find all relevant files (JS, MJS, JSON, SQL)
  find src tests migrations -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.sql" \) \
    -exec sed -i.bak "s/$old_pattern/$new_pattern/g" {} \;

  echo "   ✅ Done"
  echo ""
}

# Backup first
echo "📦 Creating backup..."
mkdir -p .backups
tar -czf ".backups/pre_atd_rename_$(date +%Y%m%d_%H%M%S).tar.gz" src tests migrations 2>/dev/null || true
echo "   ✅ Backup created in .backups/"
echo ""

# Update table names in .from() calls
update_files "from('users')" "from('atd_users')" "users table references"
update_files "from('risk_users')" "from('atd_risk_users')" "risk_users table references"
update_files "from('fraud_rules')" "from('atd_fraud_rules')" "fraud_rules table references"
update_files "from('transactions')" "from('atd_transactions')" "transactions table references"
update_files "from('sample_transactions')" "from('atd_sample_transactions')" "sample_transactions table references"
update_files "from('rule_trigger_counts')" "from('atd_rule_trigger_counts')" "rule_trigger_counts table references"
update_files "from('transactions_proj')" "from('atd_transactions_proj')" "transactions_proj table references"
update_files "from('rule_suggestions')" "from('atd_rule_suggestions')" "rule_suggestions table references"
update_files "from('rule_versions')" "from('atd_rule_versions')" "rule_versions table references"
update_files "from('rule_audits')" "from('atd_rule_audits')" "rule_audits table references"
update_files "from('dryrun_cache')" "from('atd_dryrun_cache')" "dryrun_cache table references"

# Update table names in SQL strings (double quotes)
update_files '"users"' '"atd_users"' "users in SQL strings"
update_files '"risk_users"' '"atd_risk_users"' "risk_users in SQL strings"
update_files '"fraud_rules"' '"atd_fraud_rules"' "fraud_rules in SQL strings"
update_files '"transactions"' '"atd_transactions"' "transactions in SQL strings"
update_files '"sample_transactions"' '"atd_sample_transactions"' "sample_transactions in SQL strings"
update_files '"transactions_proj"' '"atd_transactions_proj"' "transactions_proj in SQL strings"

# Update table names in SQL strings (single quotes)
update_files "'users'" "'atd_users'" "users in SQL strings (single quotes)"
update_files "'risk_users'" "'atd_risk_users'" "risk_users in SQL strings (single quotes)"
update_files "'fraud_rules'" "'atd_fraud_rules'" "fraud_rules in SQL strings (single quotes)"
update_files "'transactions'" "'atd_transactions'" "transactions in SQL strings (single quotes)"
update_files "'sample_transactions'" "'atd_sample_transactions'" "sample_transactions in SQL strings (single quotes)"

# Update table names in plain SQL (no quotes)
update_files "FROM users" "FROM atd_users" "users in SQL FROM"
update_files "FROM risk_users" "FROM atd_risk_users" "risk_users in SQL FROM"
update_files "FROM fraud_rules" "FROM atd_fraud_rules" "fraud_rules in SQL FROM"
update_files "FROM transactions" "FROM atd_transactions" "transactions in SQL FROM"
update_files "JOIN users" "JOIN atd_users" "users in SQL JOIN"
update_files "JOIN risk_users" "JOIN atd_risk_users" "risk_users in SQL JOIN"
update_files "JOIN fraud_rules" "JOIN atd_fraud_rules" "fraud_rules in SQL JOIN"
update_files "JOIN transactions" "JOIN atd_transactions" "transactions in SQL JOIN"
update_files "INTO users" "INTO atd_users" "users in SQL INSERT"
update_files "INTO risk_users" "INTO atd_risk_users" "risk_users in SQL INSERT"
update_files "INTO fraud_rules" "INTO atd_fraud_rules" "fraud_rules in SQL INSERT"
update_files "INTO transactions" "INTO atd_transactions" "transactions in SQL INSERT"

# Clean up backup files
echo "🧹 Cleaning up temporary backup files..."
find src tests migrations -name "*.bak" -delete
echo "   ✅ Cleaned up"
echo ""

echo "✅ All code references updated!"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Test application with renamed tables"
echo "  3. If issues, restore from backup: tar -xzf .backups/pre_atd_rename_*.tar.gz"
echo ""
