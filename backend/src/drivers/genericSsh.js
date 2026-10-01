import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

/**
 * Vendor-neutral driver for any SSH CLI. Everything that talks to the device
 * comes from the device's `commandOverrides` (backup, identify, disablePaging,
 * enterConfig, exitConfig, save, prompt). `cliBackup` raises an actionable
 * error when no backup command has been configured.
 */
const genericSsh = {
  id: 'generic_ssh',
  label: 'Generic CLI over SSH — commands configured per device',
  protocol: 'ssh',
  vendors: ['generic', 'cisco', 'aruba', 'juniper', 'ubiquiti'],
  deviceTypes: ['switch', 'router', 'access_point', 'wlc', 'firewall', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: true,
  supportsBackup: true,
  supportsPush: true,
  commands: {},
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, genericSsh, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, genericSsh);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, genericSsh);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, genericSsh, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, genericSsh, content, options);
  },
};

export default genericSsh;
