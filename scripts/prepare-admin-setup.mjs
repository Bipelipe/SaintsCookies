import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
const email=value('--email')?.trim().toLowerCase(),output=value('--output');
if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!output) {
  console.error('Uso: npm run site:roles -- --email conta-cadastrada@exemplo.com --output arquivo.sql');process.exit(1);
}
const escaped=email.replace(/'/g,"''");
const sql=readFileSync('docs/D1-ATUALIZACAO-0003.sql','utf8')+`
INSERT INTO account_roles(user_id,role)
SELECT id,'customer' FROM users WHERE email!='${escaped}'
AND EXISTS(SELECT 1 FROM users WHERE email='${escaped}')
ON CONFLICT(user_id) DO NOTHING;
INSERT INTO account_roles(user_id,role)
SELECT id,'admin' FROM users WHERE email='${escaped}'
ON CONFLICT(user_id) DO UPDATE SET role='admin',updated_at=unixepoch();
SELECT u.name,u.email,COALESCE(ar.role,u.role) AS role FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id WHERE u.email='${escaped}';
`;
writeFileSync(output,sql,{mode:0o600});
console.log('SQL de configuração preparado no arquivo informado. Execute no Console do D1 existente após cadastrar a conta.');
