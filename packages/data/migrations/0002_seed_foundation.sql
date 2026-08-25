-- Migration 0002: Seed Foundation Data
-- Seeds initial configuration, state master, and tax rate profiles (idempotent with ON CONFLICT DO NOTHING)

-- 1. Seed Application Settings
INSERT INTO app_settings (key, value_json, updated_at) VALUES
  ('rounding.rule', '"HALF_DOWN"', '2025-09-22T00:00:00.000Z'),
  ('tax.varianceInfoPaise', '200', '2025-09-22T00:00:00.000Z'),
  ('tax.varianceWarnPaise', '10000', '2025-09-22T00:00:00.000Z'),
  ('org.defaultStateCode', '"09"', '2025-09-22T00:00:00.000Z'),
  ('backup.retainCount', '30', '2025-09-22T00:00:00.000Z'),
  ('backup.onAppClose', 'true', '2025-09-22T00:00:00.000Z'),
  ('ui.dateFormat', '"DD/MM/YYYY"', '2025-09-22T00:00:00.000Z'),
  ('ui.locale', '"en-IN"', '2025-09-22T00:00:00.000Z')
ON CONFLICT (key) DO NOTHING;

-- 2. Seed Official Indian GST State Master List (01-38, 96, 97)
INSERT INTO states (code, name, is_union_territory, is_active) VALUES
  ('01', 'Jammu and Kashmir', 0, 1),
  ('02', 'Himachal Pradesh', 0, 1),
  ('03', 'Punjab', 0, 1),
  ('04', 'Chandigarh', 1, 1),
  ('05', 'Uttarakhand', 0, 1),
  ('06', 'Haryana', 0, 1),
  ('07', 'Delhi', 1, 1),
  ('08', 'Rajasthan', 0, 1),
  ('09', 'Uttar Pradesh', 0, 1),
  ('10', 'Bihar', 0, 1),
  ('11', 'Sikkim', 0, 1),
  ('12', 'Arunachal Pradesh', 0, 1),
  ('13', 'Nagaland', 0, 1),
  ('14', 'Manipur', 0, 1),
  ('15', 'Mizoram', 0, 1),
  ('16', 'Tripura', 0, 1),
  ('17', 'Meghalaya', 0, 1),
  ('18', 'Assam', 0, 1),
  ('19', 'West Bengal', 0, 1),
  ('20', 'Jharkhand', 0, 1),
  ('21', 'Odisha', 0, 1),
  ('22', 'Chhattisgarh', 0, 1),
  ('23', 'Madhya Pradesh', 0, 1),
  ('24', 'Gujarat', 0, 1),
  ('25', 'Daman and Diu', 1, 1),
  ('26', 'Dadra and Nagar Haveli', 1, 1),
  ('27', 'Maharashtra', 0, 1),
  ('28', 'Andhra Pradesh (Old)', 0, 1),
  ('29', 'Karnataka', 0, 1),
  ('30', 'Goa', 0, 1),
  ('31', 'Lakshadweep', 1, 1),
  ('32', 'Kerala', 0, 1),
  ('33', 'Tamil Nadu', 0, 1),
  ('34', 'Puducherry', 1, 1),
  ('35', 'Andaman and Nicobar Islands', 1, 1),
  ('36', 'Telangana', 0, 1),
  ('37', 'Andhra Pradesh', 0, 1),
  ('38', 'Ladakh', 1, 1),
  ('96', 'Other Country', 0, 1),
  ('97', 'Other Territory', 1, 1)
ON CONFLICT (code) DO NOTHING;

-- 3. Seed Tax Rate Profiles (Post-22 Sept 2025 Restructuring)
INSERT INTO tax_rate_profiles (id, name, rate_bps, effective_from, effective_to, is_active, notes) VALUES
  ('rate-profile-nil', 'Nil', 0, '2025-09-22', NULL, 1, 'Exempt and nil-rated items'),
  ('rate-profile-5', 'GST 5%', 500, '2025-09-22', NULL, 1, '5% GST Slab'),
  ('rate-profile-18', 'GST 18%', 1800, '2025-09-22', NULL, 1, '18% Standard GST Slab'),
  ('rate-profile-40', 'GST 40%', 4000, '2025-09-22', NULL, 1, '40% Special GST Slab'),
  ('rate-profile-3', 'GST 3% (precious metals)', 300, '2025-09-22', NULL, 0, 'Inactive slab for precious metals'),
  ('rate-profile-025', 'GST 0.25% (rough diamonds)', 25, '2025-09-22', NULL, 0, 'Inactive slab for rough industrial diamonds')
ON CONFLICT (id) DO NOTHING;
