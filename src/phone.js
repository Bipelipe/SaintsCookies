// The country code is displayed separately; the API stores normalized 55 + DDD + number.
function nationalDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && (/^\s*\+55/.test(value) || digits.length > 11)) digits = digits.slice(2);
  return digits.slice(0, 11);
}

export function formatBrazilPhone(value) {
  const digits = nationalDigits(value);
  if (!digits) return '';
  if (digits.length < 2) return `(${digits}`;
  const ddd = `(${digits.slice(0, 2)})`, number = digits.slice(2);
  if (!number) return ddd;
  // Keep existing landlines readable as well as the five-digit mobile prefix.
  const split = number.length > 8 ? 5 : 4;
  return `${ddd} ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ''}`;
}

export function setupPhoneFields() {
  document.querySelectorAll('[data-brazil-phone]').forEach(input => {
    input.addEventListener('input', () => {
      const count = nationalDigits(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
      input.value = formatBrazilPhone(input.value);
      let cursor = 0, seen = 0;
      while (cursor < input.value.length && seen < count) {
        if (/\d/.test(input.value[cursor])) seen++;
        cursor++;
      }
      input.setSelectionRange(cursor, cursor);
    });
    input.addEventListener('change', () => { input.value = formatBrazilPhone(input.value); });
  });
}
