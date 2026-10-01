import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

/**
 * Junos. Backups are taken as `show configuration | display set` so the very
 * same output can be replayed as `set ...` statements during a restore or when
 * used as a template body. Committing is handled by `commit and-quit`.
 */
const juniper = {
  id: 'juniper',
  label: 'Juniper Junos — switch, router, firewall (set-style CLI)',
  protocol: 'ssh',
  vendors: ['juniper'],
  deviceTypes: ['switch', 'router', 'firewall', 'other'],
  prompt: /[>#%]\s*$/,
  requiresEnable: false,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show version'],
    disablePaging: ['set cli screen-length 0'],
    backup: ['show configuration | display set'],
    enterConfig: ['configure'],
    exitConfig: ['commit and-quit'],
    save: [],
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, juniper, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, juniper);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, juniper);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, juniper, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, juniper, content, options);
  },
};

export default juniper;
