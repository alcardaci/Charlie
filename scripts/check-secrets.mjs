import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const stagedOnly = process.argv.includes('--staged');

const SECRET_PATTERNS = [
  { label: 'OpenAI key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { label: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
];

const ENV_ASSIGNMENT_PATTERNS = [
  /\bOPENAI(?:_API)?_KEY\s*=\s*.+/g,
  /\bFRED_API_KEY\s*=\s*.+/g,
  /\bFINNHUB_API_KEY\s*=\s*.+/g,
  /\bTHE_NEWS_API_TOKEN\s*=\s*.+/g,
];

function runGit(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function listFiles() {
  if (stagedOnly) {
    const output = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB']);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  const output = runGit(['ls-files']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function readFileContents(filePath) {
  if (stagedOnly) {
    return runGit(['show', `:${filePath}`]);
  }

  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function isAllowedExampleLine(filePath, line) {
  if (filePath !== '.env.example') return false;
  return /^\s*[A-Z0-9_]+\s*=\s*$/.test(line);
}

function collectMatches(filePath, text) {
  const matches = [];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (isAllowedExampleLine(filePath, line)) return;

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        matches.push({
          filePath,
          lineNumber: index + 1,
          label: pattern.label,
          line: line.trim(),
        });
      }
      pattern.regex.lastIndex = 0;
    }

    for (const regex of ENV_ASSIGNMENT_PATTERNS) {
      const hit = line.match(regex);
      if (!hit) continue;
      const [, value = ''] = line.split('=');
      if (!value.trim()) continue;
      matches.push({
        filePath,
        lineNumber: index + 1,
        label: 'Environment variable assignment',
        line: line.trim(),
      });
    }
  });

  return matches;
}

const files = listFiles().filter((filePath) => !filePath.startsWith('dist/'));
const findings = [];

for (const filePath of files) {
  let text = '';
  try {
    text = readFileContents(filePath);
  } catch {
    continue;
  }

  findings.push(...collectMatches(filePath, text));
}

if (findings.length > 0) {
  console.error('Potential secrets found:\n');
  for (const finding of findings) {
    console.error(`- ${finding.label} in ${finding.filePath}:${finding.lineNumber}`);
    console.error(`  ${finding.line}`);
  }
  process.exit(1);
}

console.log(`No secret patterns detected in ${stagedOnly ? 'staged files' : 'tracked files'}.`);
