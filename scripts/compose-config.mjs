import { isIP } from 'node:net';
import { permitted } from './license-policy.mjs';

export const IMAGE_ROLES = [
  'NODE_BUILD_IMAGE',
  'NODE_RUNTIME_IMAGE',
  'CADDY_IMAGE',
  'COTURN_IMAGE',
];
const hostname =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const pinnedImage = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;

export function validateComposeConfig(env, review) {
  for (const key of ['APP_DOMAIN', 'TURN_DOMAIN'])
    if (
      !hostname.test(env[key] ?? '') ||
      /(?:^|\.)example\.(?:org|com|net)$/i.test(env[key])
    )
      throw new Error(`Set ${key} to your real DNS hostname.`);
  if (
    isIP(env.TURN_PUBLIC_IP ?? '') !== 4 ||
    /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      env.TURN_PUBLIC_IP,
    ) ||
    Number(env.TURN_PUBLIC_IP.split('.')[0]) >= 224 ||
    /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(env.TURN_PUBLIC_IP)
  )
    throw new Error(
      'Set TURN_PUBLIC_IP to the real public relay IPv4 address.',
    );
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(env.TURN_SECRET ?? ''))
    throw new Error(
      'TURN_SECRET must be 32–256 random letters, digits, underscores or hyphens.',
    );
  if (
    !review ||
    typeof review.reviewedBy !== 'string' ||
    !review.reviewedBy.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt ?? '')
  )
    throw new Error(
      'Complete the human image-license review with reviewer and date.',
    );
  for (const role of IMAGE_ROLES) {
    if (!pinnedImage.test(env[role] ?? ''))
      throw new Error(
        `${role} must be an explicitly reviewed image pinned by SHA-256 digest.`,
      );
    const item = review.images?.[role];
    if (
      !item ||
      item.reference !== env[role] ||
      !Array.isArray(item.licenses) ||
      !item.licenses.length ||
      !item.licenses.every(permitted) ||
      typeof item.evidence !== 'string' ||
      !item.evidence.trim()
    )
      throw new Error(
        `${role} needs matching review evidence and an approved permissive license inventory.`,
      );
  }
}

export function turnConfig(env) {
  return [
    'fingerprint',
    'use-auth-secret',
    `static-auth-secret=${env.TURN_SECRET}`,
    `realm=${env.TURN_DOMAIN}`,
    `external-ip=${env.TURN_PUBLIC_IP}`,
    'listening-port=3478',
    'min-port=49160',
    'max-port=49260',
    'no-tls',
    'no-dtls',
    'no-cli',
    'no-multicast-peers',
    'no-tcp-relay',
    'userdb=/tmp/turndb',
    'user-quota=32',
    'total-quota=256',
    'max-bps=1000000',
    'denied-peer-ip=10.0.0.0-10.255.255.255',
    'denied-peer-ip=172.16.0.0-172.31.255.255',
    'denied-peer-ip=192.168.0.0-192.168.255.255',
    'denied-peer-ip=169.254.0.0-169.254.255.255',
    'log-file=stdout',
    'simple-log',
    'pidfile=/tmp/turnserver.pid',
    '',
  ].join('\n');
}
