import { describe, expect, it } from 'vitest';
import { formatReport } from './report.ts';

describe('formatReport', () => {
  it('lists each section, marks hand-added issues, and shows picked statuses', () => {
    const report = formatReport('UJANE', [
      { section: 'did', issueId: 1, origin: 'assigned', notes: 'Shipped', newStatusId: 5 },
      { section: 'did', issueId: 9, origin: 'added', notes: '', newStatusId: null },
    ]);
    expect(report).toBe(
      [
        '*Daily Update from <@UJANE>*',
        '*What I did:*\n  📋 #1: Shipped _(status → 5)_\n  🆕 #9: _no notes_',
        '*What I am doing:*\n  _none_',
      ].join('\n\n')
    );
  });
});
