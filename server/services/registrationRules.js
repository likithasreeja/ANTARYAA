// Rules for new accounts. Keep in step with client/src/utils/registrationRules.js.
// Login does not use these, so accounts created earlier can still sign in.
const PASSWORD_MIN = 6;

const normalizeName = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');

/** Returns the first problem with the registration details, or null if they are fine. */
function registrationError({ name, ownerName, password }) {
  if (normalizeName(name) === normalizeName(ownerName)) {
    return 'Shop name and your name cannot be the same';
  }
  const value = String(password || '');
  if (value.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (!/[A-Z]/.test(value)) return 'Password needs at least 1 capital letter';
  if (!/[0-9]/.test(value)) return 'Password needs at least 1 number';
  if (!/[^A-Za-z0-9\s]/.test(value)) return 'Password needs at least 1 special character (like @ # $ !)';
  return null;
}

module.exports = { registrationError, PASSWORD_MIN };
