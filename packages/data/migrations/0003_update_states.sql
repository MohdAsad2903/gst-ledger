-- Migration 0003: Update State Master for 2020 merger and discontinued state codes
-- 1. Update state 26 to official post-2020 name 'Dadra and Nagar Haveli and Daman and Diu'
UPDATE states
SET name = 'Dadra and Nagar Haveli and Daman and Diu'
WHERE code = '26';

-- 2. Discontinue state 25 (Daman and Diu (Old)) and state 28 (Andhra Pradesh (Old))
UPDATE states
SET is_active = 0
WHERE code IN ('25', '28');
