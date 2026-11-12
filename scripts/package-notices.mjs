import { copyFile } from 'node:fs/promises';
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'sbom.cdx.json'])
  await copyFile(name, `dist/${name}`);
