#!/bin/bash
# Update all code references from atd_users to atd_profiles

echo "🔄 Updating code references from atd_users to atd_profiles..."

# Update src/ directory
find src -type f \( -name "*.js" -o -name "*.sql" \) -exec sed -i.bak "s/from('atd_users')/from('atd_profiles')/g" {} \;
find src -type f \( -name "*.js" -o -name "*.sql" \) -exec sed -i.bak 's/from("atd_users")/from("atd_profiles")/g' {} \;
find src -type f \( -name "*.js" -o -name "*.sql" \) -exec sed -i.bak "s/atd_users/atd_profiles/g" {} \;

echo "✅ Code references updated!"
echo "   Next: Check if field names need adjustment (user_id vs id, name vs username)"
