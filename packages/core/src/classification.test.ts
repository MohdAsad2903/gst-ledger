import { describe, it, expect } from 'vitest';
import {
  classifySupply,
  resolveStateCode,
  stateCodeFromGstin,
  VALID_STATE_CODES,
} from './classification.js';

describe('T6 · Supply Classification & State Resolution', () => {
  it('classifies 09 (our) vs 09 (Durga Metals, Ghaziabad) as INTRA', () => {
    const result = classifySupply({ counterpartyStateCode: '09', ourStateCode: '09' });
    expect(result).toEqual({ ok: true, value: 'INTRA' });
  });

  it('classifies 09 (our) vs 07 (Shivam Enterprises, Delhi) as INTER', () => {
    const result = classifySupply({ counterpartyStateCode: '07', ourStateCode: '09' });
    expect(result).toEqual({ ok: true, value: 'INTER' });
  });

  it('classifies 09 (our) vs 07 (Chand Company, Delhi) as INTER', () => {
    const result = classifySupply({ counterpartyStateCode: '07', ourStateCode: '09' });
    expect(result).toEqual({ ok: true, value: 'INTER' });
  });

  it('rejects invalid state codes in classifySupply', () => {
    expect(classifySupply({ counterpartyStateCode: '99', ourStateCode: '09' })).toEqual({
      ok: false,
      error: 'INVALID_STATE_CODE',
    });
    expect(classifySupply({ counterpartyStateCode: '09', ourStateCode: '00' })).toEqual({
      ok: false,
      error: 'INVALID_STATE_CODE',
    });
  });

  describe('resolveStateCode', () => {
    it('uses GSTIN code when only GSTIN is provided', () => {
      const result = resolveStateCode({ gstin: '09AAOPI4018G1ZP' });
      expect(result).toEqual({ ok: true, value: '09' });
    });

    it('uses manual selection when only selectedStateCode is provided', () => {
      const result = resolveStateCode({ selectedStateCode: '07' });
      expect(result).toEqual({ ok: true, value: '07' });
    });

    it('returns code when GSTIN and manual selection agree', () => {
      const result = resolveStateCode({
        gstin: '09AAOPI4018G1ZP',
        selectedStateCode: '09',
      });
      expect(result).toEqual({ ok: true, value: '09' });
    });

    it('returns GSTIN_STATE_MISMATCH when GSTIN 09... and selection 07 disagree', () => {
      const result = resolveStateCode({
        gstin: '09AAOPI4018G1ZP',
        selectedStateCode: '07',
      });
      expect(result).toEqual({ ok: false, error: 'GSTIN_STATE_MISMATCH' });
    });

    it('returns STATE_UNKNOWN when neither GSTIN nor selection is provided', () => {
      const result = resolveStateCode({});
      expect(result).toEqual({ ok: false, error: 'STATE_UNKNOWN' });
      expect(resolveStateCode({ gstin: '', selectedStateCode: '  ' })).toEqual({
        ok: false,
        error: 'STATE_UNKNOWN',
      });
    });

    it('returns INVALID_STATE_CODE when GSTIN has invalid state code', () => {
      const result = resolveStateCode({ gstin: '99AAOPI4018G1ZP' });
      expect(result).toEqual({ ok: false, error: 'INVALID_STATE_CODE' });
    });

    it('returns INVALID_STATE_CODE when only selectedStateCode is invalid', () => {
      const result = resolveStateCode({ selectedStateCode: 'XX' });
      expect(result).toEqual({ ok: false, error: 'INVALID_STATE_CODE' });
    });

    it('returns INVALID_STATE_CODE when both present and GSTIN state code is invalid', () => {
      const result = resolveStateCode({
        gstin: '99AAOPI4018G1ZP',
        selectedStateCode: '09',
      });
      expect(result).toEqual({ ok: false, error: 'INVALID_STATE_CODE' });
    });

    it('returns INVALID_STATE_CODE when both present and selection state code is invalid', () => {
      const result = resolveStateCode({
        gstin: '09AAOPI4018G1ZP',
        selectedStateCode: 'XX',
      });
      expect(result).toEqual({ ok: false, error: 'INVALID_STATE_CODE' });
    });
  });

  describe('stateCodeFromGstin', () => {
    it('extracts valid state code from GSTIN', () => {
      expect(stateCodeFromGstin('09AAOPI4018G1ZP')).toEqual({ ok: true, value: '09' });
      expect(stateCodeFromGstin('07CKGPK3184B1Z3')).toEqual({ ok: true, value: '07' });
    });

    it('rejects string shorter than 2 characters', () => {
      expect(stateCodeFromGstin('0')).toEqual({ ok: false, error: 'INVALID_LENGTH' });
    });

    it('rejects invalid state code', () => {
      expect(stateCodeFromGstin('99AAOPI4018G1ZP')).toEqual({
        ok: false,
        error: 'INVALID_STATE_CODE',
      });
    });
  });

  it('contains UP (09) and Delhi (07) in VALID_STATE_CODES', () => {
    expect(VALID_STATE_CODES.has('09')).toBe(true);
    expect(VALID_STATE_CODES.has('07')).toBe(true);
  });
});
