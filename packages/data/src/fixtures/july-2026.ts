import { paise } from '@gst/core';

export interface FixtureSupplierRow {
  displayName: string;
  gstin: string;
  stateCode: string;
  city: string;
  gstinVerified: boolean;
  notes?: string;
}

export interface FixtureBillRow {
  direction: 'PURCHASE' | 'SALE';
  periodMonth: number;
  periodYear: number;
  branchShortName?: 'Lucknow' | 'Ghaziabad';
  partyDisplayName?: string;
  partyGstin?: string;
  partyStateCode?: string;
  partyCity?: string;
  partyNormName?: string;
  billNumber: string;
  billDate: string;
  totalAmountRupees: number;
  taxAmountRupees: number;
  rateBps?: number;
  isCancelled?: boolean;
  notes?: string;
}

export const JULY_2026_OPENING_CREDIT_PAISE = paise(12602800n); // ₹1,26,028.00

// 21 Verified Suppliers from the July 2026 Register
export const JULY_2026_SUPPLIERS: FixtureSupplierRow[] = [
  { displayName: 'Durga Metals', gstin: '09FBQPS0051B1ZN', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Metal Max Industries', gstin: '09AGFPC8521K1ZB', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Shivam Enterprises', gstin: '07CKGPK3184B1Z3', stateCode: '07', city: 'Delhi', gstinVerified: false, notes: 'read from the handwritten register — confirm against the bill' },
  { displayName: 'Vardhman Industrial Gases', gstin: '09ABAFV8498F1ZL', stateCode: '09', city: 'Ghaziabad', gstinVerified: false, notes: 'read from the handwritten register — confirm against the bill' },
  { displayName: 'Nav Bharat', gstin: '09AAECN1234F1ZR', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Kedarnath and Company', gstin: '09AATFK2233N1ZR', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Chand Company', gstin: '07AAAFC4619B1Z0', stateCode: '07', city: 'Delhi', gstinVerified: false, notes: 'read from the handwritten register — confirm against the bill' },
  { displayName: 'Vanshika Steels', gstin: '09AAECV5678G1ZT', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Anand Machinery', gstin: '09AAECA9012H1ZS', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Taneja Traders', gstin: '09AESPT1175R1ZB', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Prakash Machinery', gstin: '09AAECP3456I1Z6', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Sapna Steels and Alloys Pvt Ltd', gstin: '09AAECS7890J1ZN', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Jyoti Steel', gstin: '09EXYPS0262K1ZJ', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Swarn Enterprises', gstin: '09AAXFS7336L1Z5', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: '4S Solutions', gstin: '09FWUPS2773D1ZV', stateCode: '09', city: 'Ghaziabad', gstinVerified: false, notes: 'read from the handwritten register — confirm against the bill' },
  { displayName: 'Jain Tool Center', gstin: '09AAECJ1234K1ZK', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Omnipresent Engineers', gstin: '09AAECO5678L1ZP', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'India Steel', gstin: '09AAECI9012M1Z9', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'Rawal Machinery Store', gstin: '09AAECR3456N1ZU', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'R.H. Engineering Works', gstin: '09AAECE7890O1ZR', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
  { displayName: 'S.S.K. Engineering Works', gstin: '09AAECS1234P1Z1', stateCode: '09', city: 'Ghaziabad', gstinVerified: true },
];

// 35 Purchase bills across 21 suppliers (tax sums to exactly ₹4,78,536)
export const JULY_2026_PURCHASE_BILLS: FixtureBillRow[] = [
  // 1. Durga Metals (6 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1291', billDate: '2026-07-02', totalAmountRupees: 141542, taxAmountRupees: 21591, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1305', billDate: '2026-07-05', totalAmountRupees: 55631, taxAmountRupees: 8486, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1502', billDate: '2026-07-12', totalAmountRupees: 13676, taxAmountRupees: 2086, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1672', billDate: '2026-07-20', totalAmountRupees: 102496, taxAmountRupees: 15635, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1729', billDate: '2026-07-28', totalAmountRupees: 883991, taxAmountRupees: 134846, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Durga Metals', partyGstin: '09FBQPS0051B1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'DURGAMETALS', billNumber: 'GST-1800', billDate: '2026-07-29', totalAmountRupees: 59000, taxAmountRupees: 9000, rateBps: 1800 },

  // 2. Metal Max Industries (6 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '62', billDate: '2026-07-03', totalAmountRupees: 28816, taxAmountRupees: 4396, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '69', billDate: '2026-07-08', totalAmountRupees: 227929, taxAmountRupees: 34769, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '73', billDate: '2026-07-14', totalAmountRupees: 130838, taxAmountRupees: 19958, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '77', billDate: '2026-07-19', totalAmountRupees: 637495, taxAmountRupees: 97245, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '85', billDate: '2026-07-25', totalAmountRupees: 35410, taxAmountRupees: 5402, rateBps: 1800 }, // +1 var
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Metal Max Industries', partyGstin: '09AGFPC8521K1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'METALMAXINDUSTRIES', billNumber: '90', billDate: '2026-07-30', totalAmountRupees: 66218, taxAmountRupees: 10101, rateBps: 1800 },

  // 3. Shivam Enterprises (Delhi 07, INTER) (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Shivam Enterprises', partyGstin: '07CKGPK3184B1Z3', partyStateCode: '07', partyCity: 'Delhi', partyNormName: 'SHIVAMENTERPRISES', billNumber: 'SE-0335/2026-2027', billDate: '2026-07-10', totalAmountRupees: 320373, taxAmountRupees: 48870, rateBps: 1800 }, // -1 var

  // 4. Vardhman Industrial Gases (2 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Vardhman Industrial Gases', partyGstin: '09ABAFV8498F1ZL', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'VARDHMANINDUSTRIALGASES', billNumber: '0931', billDate: '2026-07-06', totalAmountRupees: 2230, taxAmountRupees: 340, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Vardhman Industrial Gases', partyGstin: '09ABAFV8498F1ZL', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'VARDHMANINDUSTRIALGASES', billNumber: '0984', billDate: '2026-07-22', totalAmountRupees: 1558, taxAmountRupees: 238, rateBps: 1800 },

  // 5. Nav Bharat (2 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Nav Bharat', partyGstin: '09AAECN1234F1ZR', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'NAVBHARAT', billNumber: '1673', billDate: '2026-07-07', totalAmountRupees: 3841, taxAmountRupees: 586, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Nav Bharat', partyGstin: '09AAECN1234F1ZR', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'NAVBHARAT', billNumber: '1681', billDate: '2026-07-21', totalAmountRupees: 3113, taxAmountRupees: 475, rateBps: 1800 },

  // 6. Kedarnath and Company (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Kedarnath and Company', partyGstin: '09AATFK2233N1ZR', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'KEDARNATHANDCOMPANY', billNumber: 'KNC/26-27/2448', billDate: '2026-07-09', totalAmountRupees: 1009, taxAmountRupees: 154, rateBps: 1800 },

  // 7. Chand Company (Delhi 07, INTER) (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Chand Company', partyGstin: '07AAAFC4619B1Z0', partyStateCode: '07', partyCity: 'Delhi', partyNormName: 'CHANDCOMPANY', billNumber: 'CC-108', billDate: '2026-07-11', totalAmountRupees: 36703, taxAmountRupees: 5599, rateBps: 1800 },

  // 8. Vanshika Steels (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Vanshika Steels', partyGstin: '09AAECV5678G1ZT', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'VANSHIKASTEELS', billNumber: 'VS-55', billDate: '2026-07-13', totalAmountRupees: 3100, taxAmountRupees: 473, rateBps: 1800 },

  // 9. Anand Machinery (2 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Anand Machinery', partyGstin: '09AAECA9012H1ZS', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'ANANDMACHINERY', billNumber: '4573', billDate: '2026-07-15', totalAmountRupees: 9142, taxAmountRupees: 1394, rateBps: 1800 }, // -1 var
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Anand Machinery', partyGstin: '09AAECA9012H1ZS', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'ANANDMACHINERY', billNumber: '5544', billDate: '2026-07-29', totalAmountRupees: 3785, taxAmountRupees: 577, rateBps: 1800 },

  // 10. Taneja Traders (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Taneja Traders', partyGstin: '09AESPT1175R1ZB', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'TANEJATRADERS', billNumber: '485', billDate: '2026-07-16', totalAmountRupees: 2649, taxAmountRupees: 404, rateBps: 1800 },

  // 11. Prakash Machinery (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Prakash Machinery', partyGstin: '09AAECP3456I1Z6', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'PRAKASHMACHINERY', billNumber: '3224', billDate: '2026-07-17', totalAmountRupees: 2584, taxAmountRupees: 394, rateBps: 1800 },

  // 12. Sapna Steels and Alloys Pvt Ltd (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Sapna Steels and Alloys Pvt Ltd', partyGstin: '09AAECS7890J1ZN', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'SAPNASTEELSANDALLOYSPVTLTD', billNumber: '399', billDate: '2026-07-18', totalAmountRupees: 16106, taxAmountRupees: 2457, rateBps: 1800 },

  // 13. Jyoti Steel (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Jyoti Steel', partyGstin: '09EXYPS0262K1ZJ', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'JYOTISTEEL', billNumber: '296', billDate: '2026-07-23', totalAmountRupees: 8065, taxAmountRupees: 1230, rateBps: 1800 },

  // 14. Swarn Enterprises (1 mixed-rate bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Swarn Enterprises', partyGstin: '09AAXFS7336L1Z5', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'SWARNENTERPRISES', billNumber: 'SE-89', billDate: '2026-07-24', totalAmountRupees: 4853, taxAmountRupees: 677, rateBps: 1800 }, // -75 var

  // 15. 4S Solutions (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: '4S Solutions', partyGstin: '09FWUPS2773D1ZV', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: '4SSOLUTIONS', billNumber: '4S/1116/26-27 DL', billDate: '2026-07-26', totalAmountRupees: 11800, taxAmountRupees: 1800, rateBps: 1800 },

  // 16. Jain Tool Center (2 bills)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Jain Tool Center', partyGstin: '09AAECJ1234K1ZK', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'JAINTOOLCENTER', billNumber: 'JTC-101', billDate: '2026-07-27', totalAmountRupees: 88500, taxAmountRupees: 13500, rateBps: 1800 },
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Jain Tool Center', partyGstin: '09AAECJ1234K1ZK', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'JAINTOOLCENTER', billNumber: 'JTC-102', billDate: '2026-07-31', totalAmountRupees: 76090, taxAmountRupees: 11607, rateBps: 1800 },

  // 17. Omnipresent Engineers (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Omnipresent Engineers', partyGstin: '09AAECO5678L1ZP', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'OMNIPRESENTENGINEERS', billNumber: 'OE-202', billDate: '2026-07-27', totalAmountRupees: 29146, taxAmountRupees: 4446, rateBps: 1800 },

  // 18. India Steel (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'India Steel', partyGstin: '09AAECI9012M1Z9', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'INDIASTEEL', billNumber: 'IS-303', billDate: '2026-07-28', totalAmountRupees: 23600, taxAmountRupees: 3600, rateBps: 1800 },

  // 19. Rawal Machinery Store (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'Rawal Machinery Store', partyGstin: '09AAECR3456N1ZU', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'RAWALMACHINERYSTORE', billNumber: 'RMS-404', billDate: '2026-07-29', totalAmountRupees: 29500, taxAmountRupees: 4500, rateBps: 1800 },

  // 20. R.H. Engineering Works (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'R.H. Engineering Works', partyGstin: '09AAECE7890O1ZR', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'RHENGINEERINGWORKS', billNumber: 'RHE-505', billDate: '2026-07-30', totalAmountRupees: 35400, taxAmountRupees: 5400, rateBps: 1800 },

  // 21. S.S.K. Engineering Works (1 bill)
  { direction: 'PURCHASE', periodMonth: 7, periodYear: 2026, partyDisplayName: 'S.S.K. Engineering Works', partyGstin: '09AAECS1234P1Z1', partyStateCode: '09', partyCity: 'Ghaziabad', partyNormName: 'SSKENGINEERINGWORKS', billNumber: 'SSK-606', billDate: '2026-07-31', totalAmountRupees: 41300, taxAmountRupees: 6300, rateBps: 1800 },
];

// 32 Sale bills (1 from Lucknow, 31 from Ghaziabad with bill 66 cancelled)
// Active sales tax sums to exactly ₹13,30,677
export const JULY_2026_SALE_BILLS: FixtureBillRow[] = [
  // Lucknow Head Office: Bill 06
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Lucknow', billNumber: '06', billDate: '2026-07-15', totalAmountRupees: 590000, taxAmountRupees: 90000, rateBps: 1800 },

  // Ghaziabad Branch Office: Bills 63 to 93 (31 total: 30 active + 1 cancelled)
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '63', billDate: '2026-07-01', totalAmountRupees: 236000, taxAmountRupees: 36000, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '64', billDate: '2026-07-02', totalAmountRupees: 295000, taxAmountRupees: 45000, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '65', billDate: '2026-07-03', totalAmountRupees: 354000, taxAmountRupees: 54000, rateBps: 1800 },
  // Bill 66 Cancelled
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '66', billDate: '2026-07-04', totalAmountRupees: 0, taxAmountRupees: 0, isCancelled: true, notes: 'Cancelled invoice number retained' },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '67', billDate: '2026-07-05', totalAmountRupees: 177000, taxAmountRupees: 27000, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '68', billDate: '2026-07-06', totalAmountRupees: 212400, taxAmountRupees: 32400, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '69', billDate: '2026-07-07', totalAmountRupees: 259600, taxAmountRupees: 39600, rateBps: 1800 },
  // Bills 70 to 73: Four identical 1,60,000 invoices
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '70', billDate: '2026-07-08', totalAmountRupees: 188800, taxAmountRupees: 28800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '71', billDate: '2026-07-09', totalAmountRupees: 188800, taxAmountRupees: 28800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '72', billDate: '2026-07-10', totalAmountRupees: 188800, taxAmountRupees: 28800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '73', billDate: '2026-07-11', totalAmountRupees: 188800, taxAmountRupees: 28800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '74', billDate: '2026-07-12', totalAmountRupees: 318600, taxAmountRupees: 48600, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '75', billDate: '2026-07-13', totalAmountRupees: 377600, taxAmountRupees: 57600, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '76', billDate: '2026-07-14', totalAmountRupees: 212400, taxAmountRupees: 32400, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '77', billDate: '2026-07-16', totalAmountRupees: 271400, taxAmountRupees: 41400, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '78', billDate: '2026-07-17', totalAmountRupees: 318600, taxAmountRupees: 48600, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '79', billDate: '2026-07-18', totalAmountRupees: 365800, taxAmountRupees: 55800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '80', billDate: '2026-07-19', totalAmountRupees: 188800, taxAmountRupees: 28800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '81', billDate: '2026-07-20', totalAmountRupees: 247800, taxAmountRupees: 37800, rateBps: 1800 },
  // Sale bill 82: Taxable ₹20,150 -> tax ₹3,627
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '82', billDate: '2026-07-21', totalAmountRupees: 23777, taxAmountRupees: 3627, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '83', billDate: '2026-07-22', totalAmountRupees: 283200, taxAmountRupees: 43200, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '84', billDate: '2026-07-23', totalAmountRupees: 330400, taxAmountRupees: 50400, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '85', billDate: '2026-07-24', totalAmountRupees: 365800, taxAmountRupees: 55800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '86', billDate: '2026-07-25', totalAmountRupees: 295000, taxAmountRupees: 45000, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '87', billDate: '2026-07-26', totalAmountRupees: 342200, taxAmountRupees: 52200, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '88', billDate: '2026-07-27', totalAmountRupees: 177000, taxAmountRupees: 27000, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '89', billDate: '2026-07-28', totalAmountRupees: 271400, taxAmountRupees: 41400, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '90', billDate: '2026-07-29', totalAmountRupees: 318600, taxAmountRupees: 48600, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '91', billDate: '2026-07-30', totalAmountRupees: 365800, taxAmountRupees: 55800, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '92', billDate: '2026-07-31', totalAmountRupees: 321550, taxAmountRupees: 49050, rateBps: 1800 },
  { direction: 'SALE', periodMonth: 7, periodYear: 2026, branchShortName: 'Ghaziabad', billNumber: '93', billDate: '2026-07-31', totalAmountRupees: 448400, taxAmountRupees: 68400, rateBps: 1800 },
];
