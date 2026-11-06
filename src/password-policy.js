export const passwordPattern = '(?=.*\\p{Lu})(?=.*\\p{Ll})(?=.*[0-9]).{6,128}';
export const passwordHelp = 'Use uma senha de 6 a 128 caracteres, com pelo menos uma letra maiúscula, uma minúscula e um número.';
const passwordRule = new RegExp(`^(?:${passwordPattern})$`, 'u');
export const validNewPassword = value => typeof value === 'string' && value.length <= 128 && passwordRule.test(value);
