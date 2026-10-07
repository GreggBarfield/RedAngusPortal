'use strict';
const { validateFeedlot, parseEmails, websiteHref } = require('../src/feedlotFields');

describe('parseEmails', () => {
  test('splits on semicolons, commas, spaces and new lines, lower-cases and removes repeats', () => {
    expect(parseEmails('A@x.com; b@x.com,  A@X.com\nc@x.com')).toEqual({ emails: ['a@x.com', 'b@x.com', 'c@x.com'] });
  });
  test('accepts a list', () => {
    expect(parseEmails(['a@x.com', 'b@x.com c@x.com'])).toEqual({ emails: ['a@x.com', 'b@x.com', 'c@x.com'] });
  });
  test('nothing is fine', () => {
    expect(parseEmails(null)).toEqual({ emails: [] });
    expect(parseEmails('  ')).toEqual({ emails: [] });
    expect(parseEmails([])).toEqual({ emails: [] });
  });
  test('names the address that is wrong', () => {
    expect(parseEmails('a@x.com, nope').error).toMatch(/"nope" is not a valid email/);
  });
  test('more than five is refused', () => {
    expect(parseEmails('a@x.com b@x.com c@x.com d@x.com e@x.com f@x.com').error).toMatch(/5 email/);
  });
  test('something that is not text is refused', () => {
    expect(parseEmails(42).error).toBeTruthy();
    expect(parseEmails([1]).error).toBeTruthy();
  });
});

describe('validateFeedlot', () => {
  const good = { name: '  Pinal Feeding Co.  ', state: 'az', city: 'Maricopa', zip: '85138' };

  test('a new feedlot needs a name and a state', () => {
    expect(validateFeedlot({}, {}).errors).toBeTruthy();
    expect(validateFeedlot({ state: 'TX' }).errors.name).toBeTruthy();
    expect(validateFeedlot({ name: 'X' }).errors.state).toBeTruthy();
    expect(validateFeedlot({ name: '   ', state: 'TX' }).errors.name).toBeTruthy();
  });

  test('tidies what is sent', () => {
    const { values } = validateFeedlot({ ...good, emails: 'Info@Pinal.com', phone: ' (602) 252-3467 ', website: 'www.pinalfeeding.com', contactName: '' });
    expect(values).toEqual({
      name: 'Pinal Feeding Co.',
      state: 'AZ',
      city: 'Maricopa',
      zip: '85138',
      emails: ['info@pinal.com'],
      phone: '(602) 252-3467',
      website: 'www.pinalfeeding.com',
      contactName: null,
    });
  });

  test('an edit only returns the fields that were sent and requires nothing', () => {
    expect(validateFeedlot({ fax: '(806) 668-4744' }, { partial: true }).values).toEqual({ fax: '(806) 668-4744' });
    expect(validateFeedlot({}, { partial: true }).errors._).toBeTruthy();
    expect(validateFeedlot(null, { partial: true }).errors._).toBeTruthy();
    expect(validateFeedlot([], { partial: true }).errors._).toBeTruthy();
  });

  test('a name or state cannot be cleared on an edit', () => {
    expect(validateFeedlot({ name: '' }, { partial: true }).errors.name).toBeTruthy();
    expect(validateFeedlot({ state: '' }, { partial: true }).errors.state).toBeTruthy();
  });

  test('state must be two letters', () => {
    expect(validateFeedlot({ ...good, state: 'Texas' }).errors.state).toBeTruthy();
    expect(validateFeedlot({ ...good, state: 'T1' }).errors.state).toBeTruthy();
  });

  test('zip: five digits, or nine with a dash, or empty', () => {
    expect(validateFeedlot({ ...good, zip: '72111-9535' }).values.zip).toBe('72111-9535');
    expect(validateFeedlot({ ...good, zip: '' }).values.zip).toBeNull();
    expect(validateFeedlot({ ...good, zip: '7211' }).errors.zip).toBeTruthy();
    expect(validateFeedlot({ ...good, zip: '721119535' }).errors.zip).toBeTruthy();
  });

  test('phone can hold more than one number; fax must be one real number', () => {
    expect(validateFeedlot({ ...good, phone: '(833) 450-1889; (520) 585-6936' }).values.phone).toBe('(833) 450-1889; (520) 585-6936');
    expect(validateFeedlot({ ...good, phone: 'call me' }).errors.phone).toBeTruthy();
    expect(validateFeedlot({ ...good, phone: '12345' }).errors.phone).toBeTruthy();
    expect(validateFeedlot({ ...good, fax: '555-1234' }).errors.fax).toBeTruthy();
    expect(validateFeedlot({ ...good, fax: '(806) 668-4744; (806) 111-2222' }).errors.fax).toBeTruthy();
    expect(validateFeedlot({ ...good, fax: '' }).values.fax).toBeNull();
  });

  test('website needs to look like an address', () => {
    expect(validateFeedlot({ ...good, website: 'https://cobaltcattle.com' }).values.website).toBe('https://cobaltcattle.com');
    expect(validateFeedlot({ ...good, website: 'not a site' }).errors.website).toBeTruthy();
  });

  test('yes/no fields must be true or false', () => {
    expect(validateFeedlot({ ...good, enabled: false, doNotEmail: true }).values).toMatchObject({ enabled: false, doNotEmail: true });
    expect(validateFeedlot({ ...good, enabled: 'yes' }).errors.enabled).toBeTruthy();
    expect(validateFeedlot({ ...good, doNotEmail: 1 }).errors.doNotEmail).toBeTruthy();
  });

  test('text that is too long or not text is refused', () => {
    expect(validateFeedlot({ ...good, name: 'x'.repeat(151) }).errors.name).toBeTruthy();
    expect(validateFeedlot({ ...good, notes: 'x'.repeat(2001) }).errors.notes).toBeTruthy();
    expect(validateFeedlot({ ...good, city: 5 }).errors.city).toBeTruthy();
  });

  test('a bad email is reported on the emails field', () => {
    expect(validateFeedlot({ ...good, emails: 'oops' }).errors.emails).toMatch(/oops/);
  });
});

describe('websiteHref', () => {
  test('adds https when it is missing', () => {
    expect(websiteHref('www.x.com')).toBe('https://www.x.com');
    expect(websiteHref('http://x.com/a')).toBe('http://x.com/a');
    expect(websiteHref('')).toBeNull();
    expect(websiteHref('javascript:alert(1)')).toBeNull();
    expect(websiteHref('a b')).toBeNull();
  });
});
