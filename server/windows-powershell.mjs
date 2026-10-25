import {win32} from 'node:path';
import {existsSync} from 'node:fs';

// Resolve PowerShell 7 once, before spawning. Do not change Windows execution policy.
export const windowsPowerShell=[
 ...(process.env.PATH||'').split(';').filter(Boolean).map(path=>win32.join(path.replace(/^"|"$/g,''),'pwsh.exe')),
 win32.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell','7','pwsh.exe'),
].find(path=>existsSync(path))||null;
