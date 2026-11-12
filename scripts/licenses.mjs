import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { permitted, ALLOWED_LICENSES } from './license-policy.mjs';

const root = process.cwd();
const lockBytes = await readFile('package-lock.json');
const lock = JSON.parse(lockBytes);
const lockHash = createHash('sha256').update(lockBytes).digest('hex');
const writing = process.argv.includes('--write');
const errors = [];
const packages = [];
const notices = [
  'Beebo Board — third-party notices',
  '',
  'Generated from installed npm packages, including development tools.',
  'Original notices are reproduced below. Platform-specific release artifacts',
  'must regenerate this file on their build platform. Host tools and browsers',
  'are not redistributed or certified by this inventory.',
  '',
];
const evidence = [];

async function licenseFiles(directory, depth = 0) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && depth < 8)
      result.push(...(await licenseFiles(path, depth + 1)));
    else if (
      entry.isFile() &&
      /licen[sc]e|copying|notice/i.test(entry.name) &&
      !/\.(?:js|map|ts|json|png|wasm|mdx)$/i.test(entry.name)
    )
      result.push(path);
  }
  return result.sort();
}

for (const [path, item] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = item.name ?? path.split('node_modules/').at(-1);
  if (!permitted(item.license))
    errors.push(
      `${name}@${item.version}: unapproved license ${JSON.stringify(item.license)}`,
    );
  const component = {
    type: 'library',
    'bom-ref': path,
    name,
    version: item.version,
    licenses: [{ expression: item.license }],
    externalReferences: item.resolved
      ? [{ type: 'distribution', url: item.resolved }]
      : [],
    properties: [
      { name: 'beebo:npm-lock-path', value: path },
      { name: 'beebo:development', value: String(Boolean(item.dev)) },
      { name: 'beebo:optional', value: String(Boolean(item.optional)) },
    ],
  };
  if (item.integrity?.startsWith('sha512-'))
    component.hashes = [
      {
        alg: 'SHA-512',
        content: Buffer.from(item.integrity.slice(7), 'base64').toString('hex'),
      },
    ];
  packages.push(component);
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(resolve(path, 'package.json'), 'utf8'),
    );
  } catch {
    if (!item.optional)
      errors.push(`${name}: required package is not installed`);
    evidence.push({
      name,
      version: item.version,
      license: item.license,
      inspection:
        'lockfile-metadata-only; optional platform artifact not installed',
    });
    continue;
  }
  if (manifest.version !== item.version || manifest.license !== item.license)
    errors.push(`${name}: installed metadata differs from lockfile`);
  const files = await licenseFiles(resolve(path));
  // Reviewed upstream packaging gaps. These are version-bound evidence sources,
  // not permission to skip notice inspection for arbitrary packages.
  if (
    !files.length &&
    name.startsWith('@esbuild/') &&
    item.version === '0.28.2'
  )
    files.push(resolve('node_modules/esbuild/LICENSE.md'));
  if (
    !files.length &&
    name.startsWith('@rollup/rollup-') &&
    item.version === '4.68.2'
  )
    files.push(resolve('node_modules/rollup/LICENSE.md'));
  if (
    !files.length &&
    name === 'abstract-logging' &&
    item.version === '2.0.1'
  ) {
    files.push(
      resolve(path, 'Readme.md'),
      resolve('docs/licenses/abstract-logging-2.0.1-MIT.txt'),
    );
  }
  if (!files.length) errors.push(`${name}: no license or notice file found`);
  const hashes = [];
  for (const file of files) {
    const raw = await readFile(file);
    const text = raw.toString('utf8');
    const fileName = relative(root, file).replaceAll('\\', '/');
    hashes.push({
      file: fileName,
      sha256: createHash('sha256').update(raw).digest('hex'),
    });
    // Bundled notices often reveal licenses absent from package.json. Reject copyleft
    // markers conservatively; dual-license text needs an explicit review rather than a bypass.
    if (
      /\b(?:AGPL|LGPL|GPL|MPL|EPL|CDDL)(?:[- \d.]|$)|GNU (?:General|Lesser|Affero)|Mozilla Public License/i.test(
        text,
      )
    )
      errors.push(`${fileName}: copyleft marker requires review/replacement`);
    for (const match of text.matchAll(
      /^\s*(?:License|SPDX-License-Identifier):\s*(.+)$/gm,
    )) {
      if (!permitted(match[1].trim()))
        errors.push(
          `${fileName}: unapproved bundled license ${match[1].trim()}`,
        );
    }
    notices.push(
      '='.repeat(72),
      `${name}@${item.version} — ${fileName}`,
      '='.repeat(72),
      text.trimEnd(),
      '',
    );
  }
  evidence.push({
    name,
    version: item.version,
    license: item.license,
    inspection: 'installed-metadata-and-notice-text',
    files: hashes,
  });
}
const bom =
  JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      metadata: {
        component: {
          type: 'application',
          name: 'beebo-board',
          version: lock.version,
          licenses: [{ license: { id: 'Apache-2.0' } }],
        },
        properties: [{ name: 'beebo:lockfile-sha256', value: lockHash }],
      },
      components: packages,
    },
    null,
    2,
  ) + '\n';
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else if (writing) {
  await mkdir('docs', { recursive: true });
  await writeFile('sbom.cdx.json', bom);
  await writeFile('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
  await writeFile(
    'docs/license-audit.json',
    JSON.stringify(
      {
        lockfileSha256: lockHash,
        allowedLicenses: [...ALLOWED_LICENSES],
        scope:
          'Locked npm package metadata and installed license/notice text; not a complete source-file or external-tool audit.',
        packages: evidence,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Generated SBOM, notices, and evidence for ${packages.length} locked dependencies.`,
  );
} else {
  try {
    if ((await readFile('sbom.cdx.json', 'utf8')) !== bom)
      errors.push(
        'SBOM is stale. Review dependency changes and run npm run licenses:generate.',
      );
  } catch {
    errors.push(
      'SBOM is missing. Run npm run licenses:generate after license review.',
    );
  }
  try {
    if (
      JSON.parse(await readFile('docs/license-audit.json', 'utf8'))
        .lockfileSha256 !== lockHash
    )
      errors.push('License evidence is stale.');
  } catch {
    errors.push('License evidence is missing.');
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      `License gate passed for ${packages.length} locked dependencies; ${evidence.filter((item) => item.files).length} installed package notices inspected.`,
    );
}
