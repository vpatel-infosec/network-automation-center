#!/usr/bin/env node
/**
 * Generates a CREDENTIAL_KEY (32 random bytes, hex encoded) used to encrypt
 * device credentials at rest.
 */
import crypto from 'node:crypto';

const key = crypto.randomBytes(32).toString('hex');
console.log('');
console.log('Add this line to backend/.env:');
console.log('');
console.log(`CREDENTIAL_KEY=${key}`);
console.log('');
console.log('Keep a backup of this key: without it, stored device credentials cannot be decrypted.');
console.log('');
