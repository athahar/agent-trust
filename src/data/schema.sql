-- Add description column to fraud_rules if it doesn't exist
ALTER TABLE fraud_rules 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create fraud_rules_view
CREATE OR REPLACE VIEW fraud_rules_view AS
SELECT 
    fr.*,
    creator.name as created_by_name,
    approver.name as approved_by_name
FROM fraud_rules fr
LEFT JOIN users creator ON fr.created_by = creator.user_id
LEFT JOIN users approver ON fr.approved_by = approver.user_id
ORDER BY fr.priority; 