import { describe, it, expect } from 'vitest';
import React from 'react';
import { App } from './App.js';

describe('App component (System Check screen)', () => {
  it('is a valid React component function producing React elements', () => {
    expect(typeof App).toBe('function');
    const el = React.createElement(App);
    expect(React.isValidElement(el)).toBe(true);
    expect(el.type).toBe(App);
  });
});
