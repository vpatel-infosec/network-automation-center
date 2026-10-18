import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

const ciscoNxos = {
  id: 'cisco_nxos',
  label: 'Cisco NX-OS — Nexus switch',
  protocol: 'ssh',
  vendors: ['cisco'],
  deviceTypes: ['switch', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: false,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show version'],
    disablePaging: ['terminal length 0'],
    backup: ['show running-config'],
    startupBackup: ['show startup-config'],
    enterConfig: ['configure terminal'],
    exitConfig: ['end'],
    save: ['copy running-config startup-config'],
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, ciscoNxos, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, ciscoNxos);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, ciscoNxos);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, ciscoNxos, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, ciscoNxos, content, options);
  },
};

export default ciscoNxos;
