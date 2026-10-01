import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

const ciscoIos = {
  id: 'cisco_ios',
  label: 'Cisco IOS / IOS-XE — switch, router, AP, WLC 9800',
  protocol: 'ssh',
  vendors: ['cisco'],
  deviceTypes: ['switch', 'router', 'access_point', 'wlc', 'firewall', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: true,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show version'],
    disablePaging: ['terminal length 0'],
    backup: ['show running-config'],
    enterConfig: ['configure terminal'],
    exitConfig: ['end'],
    save: ['write memory'],
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, ciscoIos, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, ciscoIos);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, ciscoIos);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, ciscoIos, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, ciscoIos, content, options);
  },
};

export default ciscoIos;
