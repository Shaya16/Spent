-- Reclassify bank-side credit card payments as transfers so they don't
-- double-count with the individual line items pulled from the credit card.
-- Mirrors the regex set in src/server/lib/transfers.ts CREDIT_CARD_PAYMENT_PATTERNS.

UPDATE transactions
SET kind = 'transfer'
WHERE provider IN ('hapoalim', 'leumi')
  AND kind != 'transfer'
  AND (
    description LIKE '%ויזה%'
    OR description LIKE '%ישראכרט%'
    OR description LIKE '%ישראכארד%'
    OR description LIKE '%ישרא־כארד%'
    OR description LIKE '%ישרא-כארד%'
    OR description LIKE '%כאל%'
    OR description LIKE '%מקסימום%'
    OR description LIKE '%מאסטרקארד%'
    OR description LIKE '%אמריקן אקספרס%'
    OR description LIKE '%אמריקןאקספרס%'
    OR description LIKE '%דיינרס%'
    OR description LIKE '%תשלום אשראי%'
    OR description LIKE '%כרטיס אשראי%'
    OR description LIKE '%חיוב כרטיס%'
    OR UPPER(description) LIKE '%ISRACARD%'
    OR UPPER(description) LIKE '%VISA%'
    OR UPPER(description) LIKE '%MASTERCARD%'
    OR UPPER(description) LIKE '%CAL%'
    OR UPPER(description) LIKE '%MAX%'
    OR UPPER(description) LIKE '%DINERS%'
    OR UPPER(description) LIKE '%AMEX%'
    OR UPPER(description) LIKE '%AMERICAN EXPRESS%'
  );
