import { describe, it, expect } from 'vitest';
import { validateGstin } from './gstin.js';

describe('T10 · validateGstin', () => {
  it('validates own GSTIN: 09AAOPI4018G1ZP', () => {
    const result = validateGstin('09AAOPI4018G1ZP');
    expect(result).toEqual({
      ok: true,
      value: {
        gstin: '09AAOPI4018G1ZP',
        stateCode: '09',
        pan: 'AAOPI4018G',
        entityCode: '1',
        checksum: 'P',
      },
    });
  });

  it('validates Durga Metals GSTIN: 09FBQPS0051B1ZN', () => {
    const result = validateGstin('09FBQPS0051B1ZN');
    expect(result).toEqual({
      ok: true,
      value: {
        gstin: '09FBQPS0051B1ZN',
        stateCode: '09',
        pan: 'FBQPS0051B',
        entityCode: '1',
        checksum: 'N',
      },
    });
  });

  it('identifies mistranscribed checksum in handwritten register fixture 07CKGPK3184B1Z3', () => {
    // As noted in prompt T10: 07CKGPK3184B1Z3 has handwritten check character '3' where algorithm computes 'D'.
    const result = validateGstin('07CKGPK3184B1Z3');
    expect(result).toEqual({ ok: false, error: 'INVALID_CHECKSUM' });
  });

  it('validates Shivam Enterprises with correct checksum: 07CKGPK3184B1ZD', () => {
    const result = validateGstin('07CKGPK3184B1ZD');
    expect(result).toEqual({
      ok: true,
      value: {
        gstin: '07CKGPK3184B1ZD',
        stateCode: '07',
        pan: 'CKGPK3184B',
        entityCode: '1',
        checksum: 'D',
      },
    });
  });

  it('rejects invalid length: "09AAOPI4018G1Z" (14 chars) -> INVALID_LENGTH', () => {
    expect(validateGstin('09AAOPI4018G1Z')).toEqual({ ok: false, error: 'INVALID_LENGTH' });
    expect(validateGstin('09AAOPI4018G1ZPPP')).toEqual({ ok: false, error: 'INVALID_LENGTH' });
  });

  it('rejects invalid state code: "99AAOPI4018G1ZP" -> INVALID_STATE_CODE', () => {
    expect(validateGstin('99AAOPI4018G1ZP')).toEqual({ ok: false, error: 'INVALID_STATE_CODE' });
  });

  it('rejects altered checksum: 09AAOPI4018G1ZA -> INVALID_CHECKSUM', () => {
    expect(validateGstin('09AAOPI4018G1ZA')).toEqual({ ok: false, error: 'INVALID_CHECKSUM' });
  });

  it('rejects malformed format / invalid characters -> INVALID_FORMAT', () => {
    expect(validateGstin('09AA1PI4018G1ZP')).toEqual({ ok: false, error: 'INVALID_FORMAT' });
    expect(validateGstin('09AAOPI4018G1XP')).toEqual({ ok: false, error: 'INVALID_FORMAT' }); // 14th char not Z
  });
});
