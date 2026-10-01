import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

/**
 * Ubiquiti EdgeSwitch / EdgeMAX style CLI. UniFi-managed devices expose only a
 * limited CLI — use this driver only where a full running-config is available,
 * otherwise override the commands per device.
 */
const ubiquiti = {
  id: 'ubiquiti',
  label: 'Ubiquiti EdgeSwitch / EdgeMAX — switch, AP, router',
  protocol: 'ssh',
  vendors: ['ubiquiti'],
  deviceTypes: ['switch', 'router', 'access_point', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: true,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show version'],
    disablePaging: ['terminal length 0'],
    backup: ['show running-config'],
    enterConfig: ['configure'],
    exitConfig: ['exit'],
    save: ['write memory'],
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, ubiquiti, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, ubiquiti);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, ubiquiti);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, ubiquiti, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, ubiquiti, content, options);
  },
};

export default ubiquiti;
