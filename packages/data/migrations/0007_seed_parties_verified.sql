-- 0007_seed_parties_verified.sql
-- Suppliers transcribed from the company's July 2026 handwritten register.
-- AUTHORED EXTERNALLY AND VERIFIED. DO NOT EDIT ANY VALUE IN THIS FILE.
-- Every GSTIN below is the number written on the supplier's bill. Four fail the
-- GSTIN checksum and are almost certainly misreadings of the handwriting; they are
-- seeded verbatim with gstin_verified = 0 so the uncertainty is recorded, not erased.

DELETE FROM parties WHERE id LIKE 'party-%' OR id LIKE 'sup-%';

INSERT INTO parties (id, display_name, display_name_norm, legal_name, gstin, gstin_verified,
                     state_code, city, is_supplier, is_customer, is_active, notes, created_at, updated_at)
VALUES
  ('sup-4s-solutions', '4S Solutions', '4SSOLUTIONS', NULL, '09FWUPS2773D1ZV', 0, '09', 'Ghaziabad', 1, 0, 1, 'read from the handwritten register — confirm against the bill', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-anand-machinery-store', 'Anand Machinery Store', 'ANANDMACHINERYSTORE', NULL, '09ADNPK1546R1ZS', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-chand-company', 'Chand Company', 'CHANDCOMPANY', NULL, '07AAAFC4619B1Z0', 0, '07', 'Delhi', 1, 0, 1, 'read from the handwritten register — confirm against the bill', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-durga-metals', 'Durga Metals', 'DURGAMETALS', NULL, '09FBQPS0051B1ZN', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-india-steel', 'India Steel', 'INDIASTEEL', NULL, '09AJZPB8042M1ZH', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-jain-tool-center', 'Jain Tool Center', 'JAINTOOLCENTER', NULL, '09ASQPJ2017G1ZQ', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-jyoti-steel', 'Jyoti Steel', 'JYOTISTEEL', NULL, '09EXYPS0262K1ZJ', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-kedarnath-and-company', 'Kedarnath and Company', 'KEDARNATHANDCOMPANY', NULL, '09AATFK2233N1ZR', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-metal-max-industries', 'Metal Max Industries', 'METALMAXINDUSTRIES', NULL, '09AGFPC8521K1ZB', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-nav-bharat-electricals', 'Nav Bharat Electricals', 'NAVBHARATELECTRICALS', NULL, '09ACGPG5251R1Z3', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-omnipresent-engineers', 'Omnipresent Engineers', 'OMNIPRESENTENGINEERS', NULL, '09AGLPV3681M1ZF', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-prakash-machinery-store', 'Prakash Machinery Store', 'PRAKASHMACHINERYSTORE', NULL, '09ADJPK2729A1ZS', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-r-h-engineering-works', 'R.H. Engineering Works', 'RHENGINEERINGWORKS', NULL, '09ADLPR8296B1ZZ', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-rawal-machinery-store', 'Rawal Machinery Store', 'RAWALMACHINERYSTORE', NULL, '09ACIPR2292M1ZX', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-s-s-k-engineering-works', 'S.S.K. Engineering Works', 'SSKENGINEERINGWORKS', NULL, '09PRHPK8752E1Z3', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-sapna-steels-and-alloys-pvt-ltd', 'Sapna Steels and Alloys Pvt Ltd', 'SAPNASTEELSANDALLOYSPVTLTD', NULL, '09AABFS0191P1ZS', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-shivam-enterprises', 'Shivam Enterprises', 'SHIVAMENTERPRISES', NULL, '07CKGPK3184B1Z3', 0, '07', 'Delhi', 1, 0, 1, 'read from the handwritten register — confirm against the bill', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-swarn-enterprises', 'Swarn Enterprises', 'SWARNENTERPRISES', NULL, '09AAXFS7336L1Z5', 1, '09', 'Lucknow', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-taneja-traders', 'Taneja Traders', 'TANEJATRADERS', NULL, '09AESPT1175R1ZB', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-vanshika-steels-india', 'Vanshika Steels (India)', 'VANSHIKASTEELSINDIA', NULL, '09AJCPB9322P1ZX', 1, '09', 'Ghaziabad', 1, 0, 1, NULL, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('sup-vardhman-industrial-gases', 'Vardhman Industrial Gases', 'VARDHMANINDUSTRIALGASES', NULL, '09ABAFV8498F1ZL', 0, '09', 'Ghaziabad', 1, 0, 1, 'read from the handwritten register — confirm against the bill', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z');
